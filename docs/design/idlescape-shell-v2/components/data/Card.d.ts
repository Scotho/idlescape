/** Raised container: script rows, market cards, the run card (gradient + rail). */
export interface CardProps {
  /** 3px left rail tone: 'accent' | 'ok' | 'warn' | 'error' or any CSS color */
  rail?: string;
  /** two-stop gradient + soft shadow (hero cards like the run card) */
  gradient?: boolean;
  /** padding px, default 11 */
  pad?: number;
  children?: React.ReactNode;
}
export declare function Card(props: CardProps): JSX.Element;