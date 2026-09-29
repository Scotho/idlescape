// client/src/hooks/objArt.test.ts
import { describe, expect, test } from 'bun:test';
import {
  ICON_SIZE,
  OBJ_ICON_MEMO_MAX,
  isObjId,
  normaliseObjCount,
  objIconKey,
  pix32ToPngDataUrl,
  renderObjIcon,
  type ObjIconPort,
  type IconCanvas,
  type IconContext,
  type IconImageData
} from './objArt';

interface FakeCanvas extends IconCanvas {
  written: IconImageData | null;
  putAt: [number, number] | null;
  toDataURLTypes: string[];
}

/** A canvas stand-in: bun has no DOM, and the encoder only needs these four members. */
function fakeCanvas(opts: { noContext?: boolean; tag?: string } = {}): FakeCanvas {
  const canvas: FakeCanvas = {
    width: 0,
    height: 0,
    written: null,
    putAt: null,
    toDataURLTypes: [],
    getContext(): IconContext | null {
      if (opts.noContext) {
        return null;
      }
      const ctx: IconContext = {
        createImageData: (w: number, h: number): IconImageData => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (image: IconImageData, dx: number, dy: number): void => {
          canvas.written = image;
          canvas.putAt = [dx, dy];
        }
      };
      return ctx;
    },
    toDataURL(type: string): string {
      canvas.toDataURLTypes.push(type);
      return `data:image/png;base64,FAKE${opts.tag ?? ''}`;
    }
  };
  return canvas;
}

describe('isObjId', () => {
  test('accepts the in-range integers of a loaded pack', () => {
    expect(isObjId(0, 1200)).toBe(true);
    expect(isObjId(995, 1200)).toBe(true);
    expect(isObjId(1199, 1200)).toBe(true);
  });

  test('rejects an id past the pack, so ObjType.list never reads out of bounds', () => {
    expect(isObjId(1200, 1200)).toBe(false);
    expect(isObjId(99999, 1200)).toBe(false);
  });

  test('rejects negatives and non-integers rather than letting them reach ObjType', () => {
    for (const id of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isObjId(id, 1200)).toBe(false);
    }
  });

  test('rejects everything before the config archive loads (numDefinitions still 0)', () => {
    expect(isObjId(0, 0)).toBe(false);
    expect(isObjId(995, 0)).toBe(false);
  });
});

describe('normaliseObjCount', () => {
  test('passes a positive integer through, so the stack-size art variant still swaps in', () => {
    expect(normaliseObjCount(1)).toBe(1);
    expect(normaliseObjCount(500)).toBe(500);
    expect(normaliseObjCount(2_147_000_000)).toBe(2_147_000_000);
  });

  test('collapses anything that would park a junk ohi in the shared sprite cache', () => {
    for (const count of [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normaliseObjCount(count)).toBe(1);
    }
  });
});

describe('objIconKey', () => {
  test('separates id from count and keeps the two counts of one id apart', () => {
    expect(objIconKey(995, 1)).toBe('995:1');
    expect(objIconKey(995, 500)).not.toBe(objIconKey(995, 1));
    expect(objIconKey(9, 951)).not.toBe(objIconKey(99, 51));
  });
});

describe('pix32ToPngDataUrl', () => {
  test('unpacks RGB into RGBA and makes 0 transparent rather than black', () => {
    const data = new Int32Array(ICON_SIZE * ICON_SIZE);
    data[0] = 0xff8040;
    data[1] = 0; // transparent
    data[2] = 0x000001; // nearly black but not 0: opaque
    const canvas = fakeCanvas();
    const url = pix32ToPngDataUrl(data, () => canvas);
    expect(url).toBe('data:image/png;base64,FAKE');
    const px = canvas.written!.data;
    expect([px[0], px[1], px[2], px[3]]).toEqual([0xff, 0x80, 0x40, 255]);
    expect([px[4], px[5], px[6], px[7]]).toEqual([0, 0, 0, 0]);
    expect([px[8], px[9], px[10], px[11]]).toEqual([0, 0, 1, 255]);
  });

  test('writes a full 32x32 frame at the origin and asks for a PNG', () => {
    const canvas = fakeCanvas();
    pix32ToPngDataUrl(new Int32Array(ICON_SIZE * ICON_SIZE).fill(0xffffff), () => canvas);
    expect(canvas.width).toBe(32);
    expect(canvas.height).toBe(32);
    expect(canvas.putAt).toEqual([0, 0]);
    expect(canvas.written!.data.length).toBe(32 * 32 * 4);
    expect(canvas.toDataURLTypes).toEqual(['image/png']);
    // Every pixel of a fully opaque sprite is opaque; none was left at the default 0 alpha.
    for (let i = 3; i < canvas.written!.data.length; i += 4) {
      expect(canvas.written!.data[i]).toBe(255);
    }
  });

  test('returns null instead of throwing when no canvas or no 2d context is available', () => {
    expect(pix32ToPngDataUrl(new Int32Array(ICON_SIZE * ICON_SIZE), () => null)).toBeNull();
    expect(pix32ToPngDataUrl(new Int32Array(ICON_SIZE * ICON_SIZE), () => fakeCanvas({ noContext: true }))).toBeNull();
  });
});

describe('OBJ_ICON_MEMO_MAX', () => {
  test('bounds the memo at a size a few MB of data URLs can live in', () => {
    expect(Number.isInteger(OBJ_ICON_MEMO_MAX)).toBe(true);
    expect(OBJ_ICON_MEMO_MAX).toBeGreaterThan(0);
  });
});

describe('renderObjIcon', () => {
  interface Rig { port: ObjIconPort; sprites: [number, number][]; faults: string[] }

  function rig(over: Partial<ObjIconPort> = {}): Rig {
    const sprites: [number, number][] = [];
    const faults: string[] = [];
    let nth = 0;
    const port: ObjIconPort = {
      numDefinitions: 3894,
      getSprite: (id: number, count: number) => {
        sprites.push([id, count]);
        return { data: new Int32Array(ICON_SIZE * ICON_SIZE) };
      },
      // A different data URL per render, so a memo hit is distinguishable from a re-render.
      newCanvas: () => fakeCanvas({ tag: String(++nth) }),
      memo: new Map<string, string>(),
      onFault: (call: string) => { faults.push(call); },
      ...over
    };
    return { port, sprites, faults };
  }

  test('renders once and then answers every repeat from the memo', () => {
    const { port, sprites } = rig();
    const first = renderObjIcon(995, 1, port);
    expect(first).toBe('data:image/png;base64,FAKE1');
    for (let i = 0; i < 50; i++) {
      expect(renderObjIcon(995, 1, port)).toBe('data:image/png;base64,FAKE1');
    }
    expect(sprites).toEqual([[995, 1]]);
    expect(port.memo.get('995:1')).toBe('data:image/png;base64,FAKE1');
  });

  test('keeps the two counts of one id apart, so the stack art is not served for a single item', () => {
    const { port, sprites } = rig();
    renderObjIcon(995, 1, port);
    renderObjIcon(995, 500, port);
    renderObjIcon(995, 1, port);
    renderObjIcon(995, 500, port);
    expect(sprites).toEqual([[995, 1], [995, 500]]);
    expect([...port.memo.keys()]).toEqual(['995:1', '995:500']);
  });

  test('clamps the count before it reaches the shared sprite cache or the memo key', () => {
    const { port, sprites } = rig();
    for (const count of [Number.NaN, 0, -5, 1.5]) {
      expect(renderObjIcon(995, count, port)).toBe('data:image/png;base64,FAKE1');
    }
    // One render at count 1, then three memo hits: no NaN ever reached getSprite.
    expect(sprites).toEqual([[995, 1]]);
    expect([...port.memo.keys()]).toEqual(['995:1']);
  });

  test('never calls getSprite for an id the guard rejects', () => {
    const { port, sprites } = rig();
    for (const id of [-1, 3894, 99999, 1.5, Number.NaN]) {
      expect(renderObjIcon(id, 1, port)).toBeNull();
    }
    expect(sprites).toEqual([]);
    expect(port.memo.size).toBe(0);
  });

  test('does not memoise a null, so a model that has not streamed yet is retried', () => {
    let streamed = false;
    const { port, sprites } = rig({
      getSprite: (id: number, count: number) => {
        sprites.push([id, count]);
        return streamed ? { data: new Int32Array(ICON_SIZE * ICON_SIZE) } : null;
      }
    });
    expect(renderObjIcon(995, 1, port)).toBeNull();
    expect(renderObjIcon(995, 1, port)).toBeNull();
    expect(port.memo.size).toBe(0);
    streamed = true;
    expect(renderObjIcon(995, 1, port)).toBe('data:image/png;base64,FAKE1');
    expect(sprites.length).toBe(3);
  });

  test('reports an unexpected getSprite throw and answers null rather than propagating it', () => {
    const boom = new Error('render fault');
    const { port, faults } = rig({ getSprite: () => { throw boom; } });
    expect(renderObjIcon(995, 500, port)).toBeNull();
    expect(faults).toEqual(['ObjType.getSprite(995, 500, 0)']);
    expect(port.memo.size).toBe(0);
  });

  test('drops the memo at the cap instead of growing without bound', () => {
    const { port } = rig();
    for (let id = 0; id < OBJ_ICON_MEMO_MAX; id++) {
      renderObjIcon(id, 1, port);
    }
    expect(port.memo.size).toBe(OBJ_ICON_MEMO_MAX);
    renderObjIcon(OBJ_ICON_MEMO_MAX, 1, port);
    expect(port.memo.size).toBe(1);
  });

  test('answers null when the page cannot give it a canvas, and remembers nothing', () => {
    const { port } = rig({ newCanvas: () => null });
    expect(renderObjIcon(995, 1, port)).toBeNull();
    expect(port.memo.size).toBe(0);
  });
});
