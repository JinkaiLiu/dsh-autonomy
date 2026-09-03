import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime, { CommandId } from '@deepseek-ai/dsh-commands'
import { createUserMessage, type CallId } from '@deepseek-ai/dsh-llm'
import SessionStore, {
  Session,
  SessionId,
  type SessionEvent,
  type UserMessage,
} from '@deepseek-ai/dsh-session'
import { createScope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import apply, {
  DEFAULT_CHAT_GUIDANCE,
  DEFAULT_DENY_MESSAGE,
  foldAutonomyMode,
  type Config,
} from '../src/index.ts'

const CONFIG: Config = {
  defaultMode: 'agent',
  chatGuidance: DEFAULT_CHAT_GUIDANCE,
  denyMessage: DEFAULT_DENY_MESSAGE,
}

const autonomyFibers = new WeakMap<Context, { dispose: () => Promise<void> }>()

function eventsOf(session: Session): readonly SessionEvent[] {
  const compatible = session as Session & {
    readonly events?: readonly SessionEvent[]
    snapshotEvents?: () => readonly SessionEvent[]
  }
  return compatible.snapshotEvents?.() ?? compatible.events ?? []
}

function callId(value: string): CallId {
  return value as CallId
}

async function setup(config: Partial<Config> | null = CONFIG): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(CommandRuntime)
  const autonomyFiber = config === null
    ? await ctx.plugin(apply)
    : await ctx.plugin(apply, config)
  autonomyFibers.set(ctx, autonomyFiber)
  ctx.tools.register(defineTool({
    name: 'probe',
    description: 'A test tool.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async () => 'ran probe',
  }))
  return ctx
}

async function createAgent(
  ctx: Context,
  id: string,
  seed?: readonly SessionEvent[],
): Promise<Agent> {
  const session = Session.create(SessionId(id), seed)
  const agent = {
    id: SessionId(id),
    session,
    options: {},
    status: 'idle',
    inject(message: UserMessage) {
      session.append('user/message', message, { surfaceOp: 'append' })
    },
  } as unknown as Agent
  let scoped!: Context
  await ctx.plugin(Object.assign((inner: Context) => {
    scoped = createScope(inner, agent).ctx
  }, { inject: ['tools'] }))
  ;(agent as Agent & { ctx: Context }).ctx = scoped
  ctx.agents.enter(agent)
  ctx.agents.announce(agent)
  return agent
}

async function executeCommand(ctx: Context, agent: Agent, line: string) {
  const execute = ctx.commands.execute as unknown as (...args: unknown[]) =>
    ReturnType<typeof ctx.commands.execute>
  const signal = new AbortController().signal
  const args = execute.length >= 4
    ? [agent, line, [], signal]
    : [agent, line, signal]
  return Reflect.apply(execute, ctx.commands, args)
}

async function command(ctx: Context, agent: Agent, mode: 'chat' | 'agent') {
  return executeCommand(ctx, agent, `/autonomy ${mode}`)
}

async function boundary(ctx: Context, agent: Agent): Promise<void> {
  const message = createUserMessage({
    content: [{ type: 'text', text: 'boundary probe' }],
    source: { kind: 'user' },
  })
  await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [message], turn: 1, step: 1, signal: new AbortController().signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
  )
}

async function assembly(ctx: Context, agent: Agent) {
  return ctx.systemPrompt.assemble({ agent, scope: agent })
}

async function executeProbe(ctx: Context, agent: Agent) {
  return ctx.tools.execute({
    callId: callId(`call-${eventsOf(agent.session).length}`),
    name: 'probe',
    arguments: {},
    agent,
    signal: new AbortController().signal,
  })
}

describe('foldAutonomyMode', () => {
  it('uses the fallback and commits only successfully completed commands', () => {
    const session = Session.create(SessionId('fold'))
    expect(foldAutonomyMode(eventsOf(session))).toBe('agent')
    expect(foldAutonomyMode(eventsOf(session), 'chat')).toBe('chat')
    session.append('command/run', {
      commandId: CommandId('fold-unpaired'), name: 'autonomy', args: ' chat', source: { kind: 'user' },
    })
    expect(foldAutonomyMode(eventsOf(session))).toBe('agent')
    session.append('command/done', {
      commandId: CommandId('fold-unpaired'), kind: 'error', text: 'failed',
    })
    expect(foldAutonomyMode(eventsOf(session))).toBe('agent')
    session.append('command/run', {
      commandId: CommandId('fold-chat'), name: 'autonomy', args: ' CHAT ', source: { kind: 'user' },
    })
    session.append('command/done', { commandId: CommandId('fold-chat'), kind: 'success' })
    session.append('command/run', {
      commandId: CommandId('fold-invalid'), name: 'autonomy', args: ' turbo', source: { kind: 'user' },
    })
    session.append('command/done', { commandId: CommandId('fold-invalid'), kind: 'success' })
    expect(foldAutonomyMode(eventsOf(session))).toBe('chat')
  })
})

describe('Chat and Agent behavior', () => {
  it('starts with safe defaults when the profile omits config entirely', async () => {
    const ctx = await setup(null)
    const agent = await createAgent(ctx, 'zero-config')
    expect((await assembly(ctx, agent)).tools.map(tool => tool.name)).toEqual(['probe'])
    expect((await executeProbe(ctx, agent)).isError).toBe(false)
  })

  it('removes tool schemas and rejects tool execution in Chat mode', async () => {
    const ctx = await setup()
    const agent = await createAgent(ctx, 'chat')

    const switched = await command(ctx, agent, 'chat')
    expect(switched?.result.kind).toBe('success')
    expect(foldAutonomyMode(eventsOf(agent.session))).toBe('chat')

    const request = await assembly(ctx, agent)
    expect(request.tools).toEqual([])
    expect(request.sections.some(section => section.text.includes('Chat mode'))).toBe(true)

    const result = await executeProbe(ctx, agent)
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{ type: 'text', text: `Error: ${DEFAULT_DENY_MESSAGE}` }])
  })

  it('restores the original tool surface and execution in Agent mode', async () => {
    const ctx = await setup()
    const agent = await createAgent(ctx, 'restore')
    await command(ctx, agent, 'chat')
    await command(ctx, agent, 'agent')

    const request = await assembly(ctx, agent)
    expect(request.tools.map(tool => tool.name)).toEqual(['probe'])
    expect(request.sections.find(section => section.name === 'autonomy:chat')?.text).toBe('')

    const result = await executeProbe(ctx, agent)
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'ran probe' }])
  })

  it('keeps mode selection and tool policy isolated between sessions', async () => {
    const ctx = await setup()
    const chatAgent = await createAgent(ctx, 'isolated-chat')
    const agentAgent = await createAgent(ctx, 'isolated-agent')

    await command(ctx, chatAgent, 'chat')

    expect(foldAutonomyMode(eventsOf(chatAgent.session))).toBe('chat')
    expect(foldAutonomyMode(eventsOf(agentAgent.session))).toBe('agent')
    expect((await assembly(ctx, chatAgent)).tools).toEqual([])
    expect((await assembly(ctx, agentAgent)).tools.map(tool => tool.name)).toEqual(['probe'])
    expect((await executeProbe(ctx, chatAgent)).isError).toBe(true)
    expect((await executeProbe(ctx, agentAgent)).isError).toBe(false)

    await command(ctx, agentAgent, 'chat')
    await command(ctx, chatAgent, 'agent')

    expect((await assembly(ctx, chatAgent)).tools.map(tool => tool.name)).toEqual(['probe'])
    expect((await assembly(ctx, agentAgent)).tools).toEqual([])
    expect((await executeProbe(ctx, chatAgent)).isError).toBe(false)
    expect((await executeProbe(ctx, agentAgent)).isError).toBe(true)
  })

  it('recovers the selected mode from a replayed session log', async () => {
    const originalCtx = await setup()
    const originalAgent = await createAgent(originalCtx, 'before-restart')
    await command(originalCtx, originalAgent, 'chat')

    const restoredCtx = await setup()
    const restoredAgent = await createAgent(
      restoredCtx,
      'after-restart',
      eventsOf(originalAgent.session),
    )

    expect(foldAutonomyMode(eventsOf(restoredAgent.session))).toBe('chat')
    expect((await assembly(restoredCtx, restoredAgent)).tools).toEqual([])
    expect((await executeProbe(restoredCtx, restoredAgent)).isError).toBe(true)
  })

  it('enforces and durably records an in-turn Chat selection immediately', async () => {
    const ctx = await setup()
    const agent = await createAgent(ctx, 'pending')
    agent.session.append('turn/start', { turn: 1 })

    await command(ctx, agent, 'chat')
    expect(foldAutonomyMode(eventsOf(agent.session))).toBe('chat')

    // The runtime selection already protects calls from an in-flight response.
    expect((await executeProbe(ctx, agent)).isError).toBe(true)
    expect((await assembly(ctx, agent)).tools).toEqual([])

    await boundary(ctx, agent)
    expect(foldAutonomyMode(eventsOf(agent.session))).toBe('chat')
  })

  it('lets an already-running tool settle while blocking later calls', async () => {
    const ctx = await setup()
    let markStarted!: () => void
    let finishTool!: (value: string) => void
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    const result = new Promise<string>((resolve) => { finishTool = resolve })
    ctx.tools.register(defineTool({
      name: 'slow-probe',
      description: 'A test tool that remains active until released.',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async () => {
        markStarted()
        return result
      },
    }))
    const agent = await createAgent(ctx, 'already-running')

    const running = ctx.tools.execute({
      callId: callId('call-already-running'),
      name: 'slow-probe',
      arguments: {},
      agent,
      signal: new AbortController().signal,
    })
    await started

    await command(ctx, agent, 'chat')
    finishTool('slow probe finished')

    await expect(running).resolves.toMatchObject({
      isError: false,
      content: [{ type: 'text', text: 'slow probe finished' }],
    })
    await expect(executeProbe(ctx, agent)).resolves.toMatchObject({ isError: true })
  })

  it('does not change mode when the command input is invalid', async () => {
    const ctx = await setup()
    const agent = await createAgent(ctx, 'invalid')
    const result = await executeCommand(ctx, agent, '/autonomy turbo')
    expect(result?.result.kind).toBe('error')
    expect(foldAutonomyMode(eventsOf(agent.session))).toBe('agent')
    expect((await executeProbe(ctx, agent)).isError).toBe(false)
  })

  it('removes agent-scoped restrictions and guards when the plugin unloads', async () => {
    const ctx = await setup()
    const agent = await createAgent(ctx, 'unload')
    await command(ctx, agent, 'chat')
    expect((await executeProbe(ctx, agent)).isError).toBe(true)

    await autonomyFibers.get(ctx)?.dispose()

    expect((await assembly(ctx, agent)).tools.map(tool => tool.name)).toEqual(['probe'])
    expect((await executeProbe(ctx, agent)).isError).toBe(false)
  })

  it('can default new sessions to Chat mode without writing synthetic events', async () => {
    const ctx = await setup({ ...CONFIG, defaultMode: 'chat' })
    const agent = await createAgent(ctx, 'default-chat')
    expect(eventsOf(agent.session)).toHaveLength(0)
    expect((await assembly(ctx, agent)).tools).toEqual([])
    expect((await executeProbe(ctx, agent)).isError).toBe(true)
  })

  it('instruments agents that already exist when the plugin loads', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(CommandRuntime)
    ctx.tools.register(defineTool({
      name: 'probe',
      description: 'A test tool.',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async () => 'ran probe',
    }))
    const agent = await createAgent(ctx, 'existing-agent')

    await ctx.plugin(apply, { ...CONFIG, defaultMode: 'chat' })

    expect((await assembly(ctx, agent)).tools).toEqual([])
    expect((await executeProbe(ctx, agent)).isError).toBe(true)
  })
})
