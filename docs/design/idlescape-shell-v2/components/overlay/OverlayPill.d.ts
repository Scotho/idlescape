/** Canvas-floating pill: xp/h line, pairing status, boosts. The ONLY language allowed over the game view. */
export interface OverlayPillProps {
  tone?: 'accent' | 'ok' | 'warn' | 'error' | 'neutral';
  children?: React.ReactNode;
}
export declare function OverlayPill(props: OverlayPillProps): JSX.Element;