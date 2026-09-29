/** Tinted status label: run state, script origin, account tier. */
export interface BadgeProps {
  tone?: 'accent' | 'ok' | 'warn' | 'error' | 'info' | 'neutral';
  /** Leading 5px dot in the tone color (e.g. 'live') */
  dot?: boolean;
  children?: React.ReactNode;
}
export declare function Badge(props: BadgeProps): JSX.Element;