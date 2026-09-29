/** The drawn 16x16 strip glyph set. Never substitute emoji. */
export interface IconProps {
  name: 'automation' | 'claude' | 'xp' | 'loot' | 'events' | 'notes' | 'screenshot' | 'bank' | 'account' | 'plugins' | 'config';
  /** px, default 16 */
  size?: number;
}
export declare function Icon(props: IconProps): JSX.Element;