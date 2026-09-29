// The pure half of client patch 28 (SP8b item art). Everything here is ours and survives an
// upstream bump untouched; `Client.ts` keeps only the cache lookups and the ObjType calls.

/** `ObjType.getSprite` always returns a 32x32 `Pix32`, whatever the obj. */
export const ICON_SIZE = 32;

/**
 * Entries kept in the client-side `(id, count) -> data URL` memo before it is dropped wholesale.
 * Each value is a 32x32 PNG data URL, in practice 0.5-3 KB, so the ceiling is a few MB. Ids are
 * bounded by `ObjType.numDefinitions`, but `count` comes from the caller and is not, hence a cap
 * rather than an assumption.
 */
export const OBJ_ICON_MEMO_MAX = 2048;

/** The `ImageData` slice the encoder writes into. */
export interface IconImageData {
  data: Uint8ClampedArray;
}

/** The 2d-context slice the encoder uses. */
export interface IconContext {
  createImageData(width: number, height: number): IconImageData;
  putImageData(image: IconImageData, dx: number, dy: number): void;
}

/** The canvas slice the encoder uses; structural so a unit test can hand it a plain object. */
export interface IconCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d'): IconContext | null;
  toDataURL(type: string): string;
}

/**
 * True when `id` may be handed to `ObjType.list` / `ObjType.getSprite`. `list` indexes a bare
 * `Int32Array` and throws outright before the config archive has loaded, at which point
 * `numDefinitions` is still 0, so this one predicate covers both the out-of-range id and the
 * called-too-early case.
 */
export function isObjId(id: number, numDefinitions: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < numDefinitions;
}

/**
 * `ObjType.spriteCache` is keyed by obj id alone and reuses the sprite's `ohi` field to remember
 * which count it was rendered for. A non-integer count would therefore park `ohi = NaN` in a
 * cache the game's own inventory draw reads back, so anything that is not a positive integer
 * becomes 1, the single-item form. `window.idlescape.client` is reachable from untyped plugin
 * code, so this cannot be left to the type signature.
 */
export function normaliseObjCount(count: number): number {
  return Number.isInteger(count) && count > 0 ? count : 1;
}

/** Memo key for one rendered icon. */
export function objIconKey(id: number, count: number): string {
  return `${id}:${count}`;
}

/**
 * Encodes a `Pix32`'s pixel buffer as a 32x32 PNG data URL. `Pix32.data` is an `Int32Array` of
 * packed RGB where 0 means transparent, so it converts straight into `ImageData`; the PNG itself
 * is the browser's own encoder via `toDataURL`, not a hand-rolled one.
 *
 * `newCanvas` is injected so this stays testable without a DOM, and returns `null` on the two
 * ways a canvas can refuse to appear (no element, no 2d context).
 */
export function pix32ToPngDataUrl(data: Int32Array, newCanvas: () => IconCanvas | null): string | null {
  const canvas: IconCanvas | null = newCanvas();
  if (!canvas) {
    return null;
  }
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx: IconContext | null = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  const image: IconImageData = ctx.createImageData(ICON_SIZE, ICON_SIZE);
  for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
    const rgb: number = data[i];
    image.data[i * 4] = (rgb >> 16) & 0xff;
    image.data[i * 4 + 1] = (rgb >> 8) & 0xff;
    image.data[i * 4 + 2] = rgb & 0xff;
    image.data[i * 4 + 3] = rgb === 0 ? 0 : 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * What `renderObjIcon` needs from the client, injected so the guard, memo, clamp and fault paths
 * are unit-testable without a cache archive or a DOM. The memo is owned by the `Client` instance,
 * not by this module, so it dies with the client rather than outliving it in module scope.
 */
export interface ObjIconPort {
  /** `ObjType.numDefinitions`; still 0 before the config archive loads. */
  numDefinitions: number;
  /** `ObjType.getSprite(id, count, 0)` - the inventory form. May throw, may answer null. */
  getSprite(id: number, count: number): { data: Int32Array } | null;
  newCanvas(): IconCanvas | null;
  /** `(id, count)` -> data URL. Populated here, cleared here when it hits the cap. */
  memo: Map<string, string>;
  /** Called at most once per session by the caller's own guard. */
  onFault(call: string, err: unknown): void;
}

/**
 * The whole `getObjIcon` path. Answers null, never throws, on everything the web can legitimately
 * hit: an id past this pack, a call before the config archive loaded, and a model OnDemand has not
 * streamed yet. Only a non-null answer is memoised, so a not-yet-streamed model is retried rather
 * than remembered as missing.
 *
 * `getSprite`'s own cache short-circuits the rasterise but not the ImageData copy, the deflate or
 * the base64, and a bank repaints the same icons constantly, so the memo sits in front of all of
 * it. The count is clamped before it is used as a key or passed on: `ObjType.spriteCache` is keyed
 * by obj id alone and stores the count in the sprite's `ohi`, so an untyped caller passing NaN
 * would otherwise park junk in a cache the game's own inventory draw reads back.
 */
export function renderObjIcon(id: number, rawCount: number, port: ObjIconPort): string | null {
  if (!isObjId(id, port.numDefinitions)) {
    return null;
  }
  const count: number = normaliseObjCount(rawCount);
  const key: string = objIconKey(id, count);
  const memo: string | undefined = port.memo.get(key);
  if (memo !== undefined) {
    return memo;
  }
  let sprite: { data: Int32Array } | null;
  try {
    sprite = port.getSprite(id, count);
  } catch (err) {
    port.onFault(`ObjType.getSprite(${id}, ${count}, 0)`, err);
    return null;
  }
  if (!sprite) {
    return null;
  }
  const url: string | null = pix32ToPngDataUrl(sprite.data, port.newCanvas);
  if (url !== null) {
    if (port.memo.size >= OBJ_ICON_MEMO_MAX) {
      port.memo.clear();
    }
    port.memo.set(key, url);
  }
  return url;
}
