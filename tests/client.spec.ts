import { describe, expect, it } from 'vitest'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, type AutonomyToggleInjected } from '../src/client/index.tsx'

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
      remote: {
        commands: {
          async execute(sessionId: SessionId, line: string) {
            executed.push({ sessionId, line })
            return {
              ok: true as const,
              value: {
                commandId: 'client-test-command',
                result: { kind: 'success' as const },
              },
            }
          },
        },
      },
    } as unknown as ClientContext

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
})
