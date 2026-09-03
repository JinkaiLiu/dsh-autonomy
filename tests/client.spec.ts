import { describe, expect, it } from 'vitest'
import {
  apply,
  type AutonomyClientContext,
  type AutonomyToggleInjected,
} from '../src/client/index.tsx'

type SessionId = string

describe('Web client registration', () => {
  it('mounts above the composer and dispatches the session command', async () => {
    let slotName: string | undefined
    let registration: {
      name: string
      id: string
      order: number
      inject: (sessionId: SessionId) => AutonomyToggleInjected
    } | undefined
    const executed: Array<{ sessionId: SessionId; line: string }> = []

    const ctx = {
      slots: {
        inject(name: string, mount: () => unknown) {
          slotName = name
          return mount()
        },
        register(options: typeof registration, _component: unknown) {
          registration = options
          return () => {}
        },
      },
      sessions: {
        binding(sessionId: SessionId) {
          return {
            session: {
              async command(line: string) {
                executed.push({ sessionId, line })
                return { ok: true as const, value: { matched: true } }
              },
            },
          }
        },
      },
    } as unknown as AutonomyClientContext

    apply(ctx)

    expect(slotName).toBe('conversation.input.dock')
    expect(registration).toMatchObject({
      name: 'conversation.input.dock',
      id: 'autonomy',
      order: 100,
    })

    const sessionId = 'client-test-session' as SessionId
    await expect(registration?.inject(sessionId).setMode('chat')).resolves.toBeNull()
    expect(executed).toEqual([{ sessionId, line: '/autonomy chat' }])
  })

  it('returns actionable messages for session, transport, and admission failures', async () => {
    let registration: {
      name: string
      id: string
      order: number
      inject: (sessionId: SessionId) => AutonomyToggleInjected
    } | undefined
    const responses = [
      {
        ok: false as const,
        error: { message: 'relay unavailable', code: 'REMOTE_UNAVAILABLE' },
      },
      { ok: true as const, value: { matched: false } },
    ]
    let available = true

    const ctx = {
      slots: {
        inject(_name: string, mount: () => unknown) {
          return mount()
        },
        register(options: typeof registration, _component: unknown) {
          registration = options
          return () => {}
        },
      },
      sessions: {
        binding(_sessionId: SessionId) {
          if (!available) return undefined
          return {
            session: {
              async command(_line: string) {
                return responses.shift()
              },
            },
          }
        },
      },
    } as unknown as AutonomyClientContext

    apply(ctx)

    const controls = registration?.inject('client-errors' as SessionId)
    await expect(controls?.setMode('chat')).resolves.toBe(
      'relay unavailable (REMOTE_UNAVAILABLE)',
    )
    await expect(controls?.setMode('agent')).resolves.toBe('unknown command: /autonomy')
    available = false
    await expect(controls?.setMode('chat')).resolves.toBe('session unavailable')
  })
})
