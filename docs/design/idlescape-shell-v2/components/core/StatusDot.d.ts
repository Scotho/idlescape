/** Presence/state dot: online, Claude driving, paused, errored, idle. */
export interface StatusDotProps {
  tone?: 'ok' | 'accent' | 'warn' | 'error' | 'idle';
  /** px, default 8 */
  size?: number;
  /** pulse ring animation (live run) */
  pulse?: boolean;
  /** soft glow shadow */
  glow?: boolean;
}
export declare function StatusDot(props: StatusDotProps): JSX.Element;