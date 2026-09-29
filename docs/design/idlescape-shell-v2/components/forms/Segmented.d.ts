/** Orange-tint segmented control: panel sub-tabs, event character filter. */
export interface SegmentedProps {
  options: string[];
  value: string;
  onChange?: (value: string) => void;
}
export declare function Segmented(props: SegmentedProps): JSX.Element;