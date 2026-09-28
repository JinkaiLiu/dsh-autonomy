import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { AutonomyMode, AutonomyProjection } from '../types.ts'
import type {} from '../client-types.ts'

export const inject = ['slots', 'sessions']

export interface AutonomyToggleInjected {
  setMode: (mode: AutonomyMode) => Promise<string | null>
}

type SessionId = string

type CommandResult =
  | { ok: true; value: { matched: boolean } }
  | { ok: false; error: { message: string; code: string } }

/** Minimal client surface shared by the rc runtime and alpha Session Controller. */
export interface AutonomyClientContext {
  slots: {
    inject: (name: 'conversation.input.dock', mount: () => unknown) => unknown
    register: (
      options: {
        name: 'conversation.input.dock'
        id: string
        order: number
        label?: string
        inject: (sessionId: SessionId) => AutonomyToggleInjected
      },
      component: typeof AutonomyToggle,
    ) => unknown
  }
  sessions: {
    binding: (sessionId: SessionId) => {
      session: { command: (line: string) => Promise<CommandResult> }
    } | undefined
  }
}

/** Stable slot surface shared by the legacy runtime and current Session Controller. */
export interface AutonomyToggleProps extends AutonomyToggleInjected {
  useProjection: (key: 'autonomy') => AutonomyProjection | undefined
}

const styles: Record<string, CSSProperties> = {
  dock: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    minWidth: 0,
    padding: '0 4px',
    boxSizing: 'border-box',
  },
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 26,
    padding: 2,
    boxSizing: 'border-box',
    border: '1px solid var(--dsw-alias-border-l2-darkmode-thin)',
    borderRadius: 999,
    background: 'var(--dsw-alias-bg-layer-1)',
    flex: 'none',
  },
  button: {
    minWidth: 48,
    height: 20,
    padding: '0 9px',
    border: 0,
    borderRadius: 999,
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    font: 'inherit',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: '20px',
    cursor: 'pointer',
    transition: 'background-color 120ms ease, color 120ms ease, opacity 120ms ease',
  },
  active: {
    background: 'var(--dsw-alias-interactive-bg-active)',
    color: 'var(--dsw-alias-label-primary)',
    fontWeight: 600,
  },
  pending: {
    opacity: 0.62,
    cursor: 'wait',
  },
  error: {
    marginLeft: 6,
    color: 'var(--dsw-alias-state-error-primary)',
    fontSize: 11,
  },
}

/** Always-visible segmented control over the host-folded autonomy projection. */
export function AutonomyToggle({ useProjection, setMode }: AutonomyToggleProps) {
  const projection = useProjection('autonomy')
  const [submitting, setSubmitting] = useState<AutonomyMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  if (projection === undefined) return null
  const selected = projection.mode

  const choose = (mode: AutonomyMode): void => {
    if (mode === selected || submitting !== null) return
    setSubmitting(mode)
    setError(null)
    void setMode(mode).then((failure) => {
      if (!alive.current) return
      setSubmitting(null)
      setError(failure)
    }, (reason: unknown) => {
      if (!alive.current) return
      setSubmitting(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <div style={styles.dock} data-autonomy-toggle="">
      <span
        style={styles.root}
        role="group"
        aria-label="Autonomy mode"
        aria-busy={submitting !== null}
      >
        {(['chat', 'agent'] as const).map(mode => {
          const active = selected === mode
          return (
            <button
              key={mode}
              type="button"
              style={{
                ...styles.button,
                ...(active ? styles.active : {}),
                ...(submitting !== null ? styles.pending : {}),
              }}
              aria-pressed={active}
              title={mode === 'chat'
                ? 'Chat: keep this session context and block further tool calls. An action already in progress is not cancelled; use Stop to end it.'
                : 'Agent: restore the full DeepSeek Harness agent loop'}
              disabled={submitting !== null}
              onClick={() => { choose(mode) }}
            >
              {mode === 'chat' ? 'Chat' : 'Agent'}
            </button>
          )
        })}
      </span>
      {error !== null && (
        <span style={styles.error} role="status" title={error}>switch failed</span>
      )}
    </div>
  )
}

/** Register the toggle on its own right-aligned row above the composer card. */
export function apply(ctx: AutonomyClientContext): void {
  const sessions = ctx.sessions
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'autonomy',
    order: 100,
    label: 'Autonomy',
    inject: (sessionId: SessionId): AutonomyToggleInjected => ({
      setMode: async (mode) => {
        const session = sessions.binding(sessionId)?.session
        if (session === undefined) return 'session unavailable'
        const result = await session.command(`/autonomy ${mode}`)
        if (!result.ok) return `${result.error.message} (${result.error.code})`
        if (!result.value.matched) return 'unknown command: /autonomy'
        return null
      },
    }),
  }, AutonomyToggle))
}
