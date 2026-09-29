/**
 * Primary action control of the idlescape shell.
 * @startingPoint section="Core" subtitle="Buttons in five variants and four sizes" viewport="700x260"
 */
export interface ButtonProps {
  /** 'default' | 'primary' | 'danger' | 'outline' | 'link' */
  variant?: 'default' | 'primary' | 'danger' | 'outline' | 'link';
  /** 'xs' 22px | 'sm' 25px | 'md' 27px | 'lg' 29px */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Fill the row (flex, 100% width) */
  block?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;