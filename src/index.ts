/**
 * Durable, per-session Chat/Agent autonomy control for DeepSeek Harness.
 *
 * Chat mode removes tool schemas from model requests, restricts the agent's
 * inherited tool surface, and guards execution in case a provider still emits
 * a tool call. Agent mode removes those constraints and restores the composed
 * Harness behavior.
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { CommandId } from '@deepseek-ai/dsh-commands'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'
import { z } from 'zod'
import type { ZodType } from 'zod'
import type { AutonomyMode, AutonomyProjection } from './types.ts'

// Resolve optional services when their host rows are present.
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'

export type * from './types.ts'

export const name = 'autonomy'
export const inject = ['agents', 'tools', 'systemPrompt'] as const

export const DEFAULT_CHAT_GUIDANCE = [
  'You are in Chat mode.',
  'Answer the user directly in text without using tools, changing files, running commands, or continuing autonomously.',
  'If the request requires action, explain what should be done and ask the user to switch to Agent mode.',
].join(' ')

export const DEFAULT_DENY_MESSAGE =
  'Chat mode does not allow tool execution. Switch this session to Agent mode to use tools.'

export interface Config {
  /** Mode used when a session has no valid /autonomy command record. */
  defaultMode: AutonomyMode
  /** System-prompt guidance included only while Chat mode is effective. */
  chatGuidance: string
  /** Error returned if a provider emits a tool call while Chat mode is active. */
  denyMessage: string
}

export const Config: Schema<Config> = Schema.object({
  defaultMode: Schema.union(['agent', 'chat']).default('agent'),
  chatGuidance: Schema.string().default(DEFAULT_CHAT_GUIDANCE),
  denyMessage: Schema.string().default(DEFAULT_DENY_MESSAGE),
})

interface AutonomyUnitState {
  mode: AutonomyMode
  attempts: readonly AutonomyAttempt[]
}

interface AutonomyAttempt {
  commandId: string
  mode: AutonomyMode
}

interface RuntimeSelection {
  commandId: CommandId
  mode: AutonomyMode
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    autonomy: AutonomyUnitState
  }
}

interface AgentInstrumentation {
  guard: () => void
  prompt: () => void
  restriction?: () => void
}

/** Read a complete event snapshot across the rc and 0.1.2 Session APIs. */
function sessionEvents(session: Session): readonly SessionEvent[] {
  const compatible = session as Session & {
    readonly events?: readonly SessionEvent[]
    snapshotEvents?: () => readonly SessionEvent[]
  }
  if (typeof compatible.snapshotEvents === 'function') {
    return compatible.snapshotEvents()
  }
  return compatible.events ?? []
}

const projectionSchema: ZodType<AutonomyProjection> = z.object({
  mode: z.enum(['chat', 'agent']),
})

const projectionStateSchema: ZodType<AutonomyUnitState> = z.object({
  mode: z.enum(['chat', 'agent']),
  attempts: z.array(z.object({
    commandId: z.string(),
    mode: z.enum(['chat', 'agent']),
  })),
})

function isMode(value: string): value is AutonomyMode {
  return value === 'chat' || value === 'agent'
}

function commandMode(event: SessionEvent): AutonomyMode | undefined {
  if (event.type !== 'command/run' || event.data.name !== 'autonomy') return undefined
  const raw = event.data.args?.trim().toLowerCase() ?? ''
  return isMode(raw) ? raw : undefined
}

/** Fold one session log into its effective durable mode. */
export function foldAutonomyMode(
  events: readonly SessionEvent[],
  fallback: AutonomyMode = 'agent',
): AutonomyMode {
  let mode = fallback
  const attempts = new Map<CommandId, AutonomyMode>()
  for (const event of events) {
    if (event.type === 'command/run') {
      const candidate = commandMode(event)
      if (candidate !== undefined) attempts.set(event.data.commandId, candidate)
      continue
    }
    if (event.type !== 'command/done') continue
    const candidate = attempts.get(event.data.commandId)
    if (candidate === undefined) continue
    attempts.delete(event.data.commandId)
    if (event.data.kind === 'success') mode = candidate
  }
  return mode
}

/** Plugin body. */
export function apply(ctx: Context, config?: Partial<Config>): void {
  // Cordis passes `undefined` when a profile row omits `config` entirely.
  // Schema defaults cover fields in an object, so normalize the absent object
  // here as well; a zero-config install must remain the primary path.
  const settings: Config = {
    defaultMode: config?.defaultMode ?? 'agent',
    chatGuidance: config?.chatGuidance ?? DEFAULT_CHAT_GUIDANCE,
    denyMessage: config?.denyMessage ?? DEFAULT_DENY_MESSAGE,
  }
  // The rc client-runtime declarations can contribute their older Session
  // identity while an alpha host is installed. Object identity is the actual
  // key contract here and avoids coupling these runtime maps to either shape.
  const runtimeSelections = new WeakMap<object, RuntimeSelection>()
  const instrumented = new Map<Agent, AgentInstrumentation>()
  const agentsBySession = new WeakMap<object, Agent>()

  const effectiveMode = (agent: Agent): AutonomyMode =>
    runtimeSelections.get(agent.session)?.mode
      ?? foldAutonomyMode(sessionEvents(agent.session), settings.defaultMode)

  /** Keep inherited schemas aligned with the selected mode. */
  const syncRestriction = (agent: Agent): void => {
    const state = instrumented.get(agent)
    if (state === undefined) return
    const dispose = state.restriction
    if (effectiveMode(agent) === 'chat') {
      if (dispose === undefined) {
        // An empty allowlist hides inherited tools now and any added later.
        state.restriction = agent.ctx.tools.restrict({ allow: [] })
      }
      return
    }
    if (dispose !== undefined) {
      dispose()
      delete state.restriction
    }
  }

  const cleanupAgent = (agent: Agent): void => {
    const state = instrumented.get(agent)
    if (state === undefined) return
    instrumented.delete(agent)
    agentsBySession.delete(agent.session)
    runtimeSelections.delete(agent.session)
    state.restriction?.()
    state.prompt()
    state.guard()
  }

  /** Install the two runtime fences that cannot be expressed by restriction alone. */
  const instrument = (agent: Agent): void => {
    if (instrumented.has(agent)) return
    const state: AgentInstrumentation = { guard: () => {}, prompt: () => {} }
    instrumented.set(agent, state)
    agentsBySession.set(agent.session, agent)

    try {
      // Defense in depth: a provider can theoretically emit a remembered tool
      // name even when the current request advertises none.
      state.guard = agent.ctx.tools.guard(() =>
        effectiveMode(agent) === 'chat' ? settings.denyMessage : undefined)

      // ToolRuntime.restrict cannot remove the reserved Code Mode transport or
      // exact-scope registrations. The final request assembly is authoritative,
      // so Chat mode clears those too and removes now-inapplicable SDK sections.
      state.prompt = agent.ctx.on('system-prompt/assemble', async (
        _assembly,
        _context,
        next,
      ): Promise<PromptAssembly> => {
        const assembly = await next()
        if (effectiveMode(agent) !== 'chat') return assembly
        return {
          ...assembly,
          sections: assembly.sections.filter(section =>
            section.name !== 'tools:sdk' && section.name !== 'tools:code-only'),
          tools: [],
        }
      })

      syncRestriction(agent)
    } catch (cause) {
      cleanupAgent(agent)
      throw cause
    }
  }

  ctx.on('agent/created', ({ agent }) => { instrument(agent) })
  ctx.on('agent/disposed', ({ agent }) => { cleanupAgent(agent) })

  // CommandRuntime appends command/done after the handler settles. Until then
  // the runtime selection closes the tiny gap between click and durable
  // success; a failed command rolls back to the last committed mode.
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'command/done') return
    const selection = runtimeSelections.get(session)
    if (selection?.commandId !== event.data.commandId) return
    runtimeSelections.delete(session)
    const agent = agentsBySession.get(session)
    if (agent !== undefined) syncRestriction(agent)
  })

  ctx.effect(() => () => {
    for (const agent of [...instrumented.keys()]) cleanupAgent(agent)
  }, 'dsh-autonomy: agent instrumentation')

  // Reconcile again at every model boundary so a resumed agent and any other
  // command surface see exactly the same tool visibility.
  ctx.on('agent/pre-step', async ({ agent, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    instrument(agent)
    syncRestriction(agent)
    return decision
  })

  ctx.systemPrompt.section({
    name: 'autonomy:chat',
    order: 40,
    text: (context) =>
      context.agent !== undefined && effectiveMode(context.agent) === 'chat'
        ? settings.chatGuidance
        : '',
  })

  ctx.inject(['sessionProjections'], (projectionCtx) => {
    // DSH 0.1.0 exposes `schema`/`view` directly, while 0.1.1 moves the
    // durable-state schema to `stateSchema` and the public view under `wire`.
    // Keeping both shapes makes one package safe across the two API families.
    const definition = {
      key: 'autonomy',
      schema: projectionSchema,
      stateSchema: projectionStateSchema,
      init: () => ({ mode: settings.defaultMode, attempts: [] }),
      apply: (state: AutonomyUnitState, event: SessionEvent): AutonomyUnitState => {
        if (event.type === 'command/run') {
          const mode = commandMode(event)
          if (mode === undefined) return state
          return {
            ...state,
            attempts: [...state.attempts, { commandId: event.data.commandId, mode }],
          }
        }
        if (event.type !== 'command/done') return state
        const attempt = state.attempts.find(candidate =>
          candidate.commandId === event.data.commandId)
        if (attempt === undefined) return state
        const attempts = state.attempts.filter(candidate => candidate !== attempt)
        if (event.data.kind !== 'success') return { ...state, attempts }
        return { mode: attempt.mode, attempts }
      },
      view: (state: AutonomyUnitState): AutonomyProjection => ({ mode: state.mode }),
      wire: {
        viewSchema: projectionSchema,
        view: (state: AutonomyUnitState): AutonomyProjection => ({ mode: state.mode }),
      },
      stateVersion: 2,
    } as const
    projectionCtx.sessionProjections.register(definition)
  })

  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'autonomy',
      description: 'Switch this session between Chat and Agent mode',
      input: { hint: '<chat|agent>' },
      handler: ({ agent, commandId, rawInput }) => {
        const mode = rawInput.trim().toLowerCase()
        if (!isMode(mode)) {
          return { kind: 'error', text: 'Usage: /autonomy <chat|agent>' }
        }
        instrument(agent)
        runtimeSelections.set(agent.session, { commandId, mode })
        try {
          syncRestriction(agent)
        } catch (cause) {
          runtimeSelections.delete(agent.session)
          syncRestriction(agent)
          throw cause
        }
        if (mode === 'chat') {
          return {
            kind: 'success',
            text: 'Chat mode selected. Further tool calls are blocked. An action already in progress is not cancelled; use Stop to end it.',
          }
        }
        return { kind: 'success', text: 'Agent mode selected. Full tool access is restored.' }
      },
    })
  })

  // A profile can enable or reload the plugin while sessions already exist.
  for (const agent of ctx.agents.list()) instrument(agent)
}

// Preserve the direct `ctx.plugin(apply, config)` development/test path while
// the package-module Loader reads the same named `inject` export in profiles.
Object.assign(apply, { inject })

export default apply
