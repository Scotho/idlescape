/** Status HUD row as a pill: label + 42px bar + value. Stack top-right over the canvas. */
export interface HudPillProps {
  meter?: 'hp' | 'prayer' | 'run';
  /** 0-100 */
  pct?: number;
  /** display value, e.g. '14/18' */
  value?: string;
}
export declare function HudPill(props: HudPillProps): JSX.Element;