/** Text input on the sunken well. Focus ring comes from base.css. */
export interface InputProps {
  /** monospace 10px (pairing URLs, code-ish values) */
  mono?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (e: any) => void;
}
export declare function Input(props: InputProps): JSX.Element;