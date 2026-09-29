/** Native checkbox, accent-colored. Used as plugin/setting toggles. */
export interface CheckboxProps { checked?: boolean; defaultChecked?: boolean; disabled?: boolean; onChange?: (e: any) => void; }
export declare function Checkbox(props: CheckboxProps): JSX.Element;