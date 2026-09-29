/** Left-railed inline notice: requirements warnings, info notes, pairing instructions. */
export interface AlertProps {
  tone?: 'accent' | 'ok' | 'warn' | 'error' | 'info';
  children?: React.ReactNode;
}
export declare function Alert(props: AlertProps): JSX.Element;