/** Character slot tab: dot + name + mono status (online timer / 'offline'). Four slots, always. */
export interface CharTabProps {
  name: string;
  /** right-aligned mono status: '1:29:07', 'offline', 'soon' */
  status?: string;
  /** dot tone; 'none' hides the dot (+ New character slot) */
  tone?: 'ok' | 'accent' | 'warn' | 'idle' | 'none';
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}
export declare function CharTab(props: CharTabProps): JSX.Element;