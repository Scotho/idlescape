/** Icon-strip tab: 40x33, orange glyph + inset left rail when active, optional status dot. */
export interface StripButtonProps {
  icon: string;
  /** tooltip + aria-label */
  label: string;
  active?: boolean;
  /** StatusDot tone for the corner dot (live run on Automation) */
  dot?: 'ok' | 'accent' | 'warn' | 'error';
  onClick?: () => void;
}
export declare function StripButton(props: StripButtonProps): JSX.Element;