import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime, { CommandId } from '@deepseek-ai/dsh-commands'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
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

async function createAgent(ctx: Context, id: string): Promise<Agent> {
  const session = Session.create(SessionId(id))
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

async function command(ctx: Context, agent: Agent, mode: 'chat' | 'agent') {
  return ctx.commands.execute(
    agent,
    `/autonomy ${mode}`,
    new AbortController().signal,
  )
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
    callId: CallId(`call-${agent.session.events.length}`),
    name: 'probe',
    arguments: {},
    agent,
    signal: new AbortController().signal,
  })
}

describe('foldAutonomyMode', () => {
  it('uses the fallback and commits only successfully completed commands', () => {
    const session = Session.create(SessionId('fold'))
    expect(foldAutonomyMode(session.events)).toBe('agent')
    expect(foldAutonomyMode(session.events, 'chat')).toBe('chat')
    session.append('command/run', {
      commandId: CommandId('fold-unpaired'), name: 'autonomy', args: ' chat', source: { kind: 'user' },
    })
    expect(foldAutonomyMode(session.events)).toBe('agent')
    session.append('command/done', {
      commandId: CommandId('fold-unpaired'), kind: 'error', text: 'failed',
    })
    expect(foldAutonomyMode(session.events)).toBe('agent')
    session.append('command/run', {
      commandId: CommandId('fold-chat'), name: 'autonomy', args: ' CHAT ', source: { kind: 'user' },
    })
    session.append('command/done', { commandId: CommandId('fold-chat'), kind: 'success' })
    session.append('command/run', {
      commandId: CommandId('fold-invalid'), name: 'autonomy', args: ' turbo', source: { kind: 'user' },
    })
    session.append('command/done', { commandId: CommandId('fold-invalid'), kind: 'success' })
    expect(foldAutonomyMode(session.events)).toBe('chat')
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
    expect(foldAutonomyMode(agent.session.events)).toBe('chat')

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

  it('enforces and durably records an in-turn Chat selection immediately', async () => {
    const ctx = await setup()
    const agent = await createAgent(ctx, 'pending')
    agent.session.append('turn/start', { turn: 1 })

    await command(ctx, agent, 'chat')
    expect(foldAutonomyMode(agent.session.events)).toBe('chat')

    // The runtime selection already protects calls from an in-flight response.
    expect((await executeProbe(ctx, agent)).isError).toBe(true)
    expect((await assembly(ctx, agent)).tools).toEqual([])

    await boundary(ctx, agent)
    expect(foldAutonomyMode(agent.session.events)).toBe('chat')
  })

  it('does not change mode when the command input is invalid', async () => {
    const ctx = await setup()
    const agent = await createAgent(ctx, 'invalid')
    const result = await ctx.commands.execute(
      agent,
      '/autonomy turbo',
      new AbortController().signal,
    )
    expect(result?.result.kind).toBe('error')
    expect(foldAutonomyMode(agent.session.events)).toBe('agent')
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
    expect(agent.session.events).toHaveLength(0)
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
