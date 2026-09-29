/** Label-left, value-right row (Used 27/240, Gateway up). */
export interface KVProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** numeric value in --font-num */
  mono?: boolean;
  /** value color override, e.g. 'var(--ok-bright)' */
  tone?: string;
}
export declare function KV(props: KVProps): JSX.Element;