/** Thin progress bar: XP-to-level (shimmer while live), HUD meters, bank capacity. */
export interface MeterProps {
  /** 0-100 */
  pct: number;
  tone?: 'accent' | 'hp' | 'prayer' | 'run' | string;
  /** animate the gradient while the value is live */
  shimmer?: boolean;
  /** px, default 5 */
  height?: number;
}
export declare function Meter(props: MeterProps): JSX.Element;