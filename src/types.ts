/** The two user-facing autonomy levels in the first release. */
export type AutonomyMode = 'chat' | 'agent'

/** Host-folded state consumed by the Web composer control. */
export interface AutonomyProjection {
  /** Last durable mode in force for the session. */
  mode: AutonomyMode
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Durable Chat/Agent autonomy state. */
    autonomy: AutonomyProjection
  }
}
