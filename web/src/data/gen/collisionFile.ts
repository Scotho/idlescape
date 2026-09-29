// `collision.bin`: one bit per tile per level over the populated map squares, with a square
// index so empty squares cost nothing. Read by the Worker on the first `travel.to`, written by
// scripts/gen/collision.ts. Budget: 1 MB raw, 400 KB gzipped (spec decision 2); 487 squares x
// 4 levels x 512 bytes is 997 KB, so the index is what keeps it inside.
//
// The index carries two masks per square rather than one. "Present" is the set of levels the
// square has at all, which is what `isZoneAllocated` answers and what the engine allocates
// (GameMap.ts calls `rsmod.allocateIfAbsent` for every level of every square it loads).
// "Payload" is the subset that actually has a blocked tile; a level whose 512 bytes are all
// zero is still allocated but is not stored, and that is what keeps the file inside its budget.
//
// Layout, little-endian:
//   0  u32   magic 'ISCB'
//   4  u8    version (1)
//   5  u8    reserved (0)
//   6  u16   square count
//   8  n x 4 index rows: u8 mx, u8 mz, u8 present level mask, u8 payload level mask
//   ...      payload: for each square, for each set payload bit ascending, 512 bytes

export interface EncodedSquare { mx: number; mz: number; levels: Map<number, Uint8Array> }

export interface CollisionGrid {
  /** Absolute tile coordinates. False for a tile in a square the file does not carry. */
  blocked(level: number, x: number, z: number): boolean;
  /** Whether the file carries this square at this level at all. */
  hasSquare(level: number, x: number, z: number): boolean;
  readonly squareCount: number;
}

const MAGIC = 0x42435349;        // 'ISCB' little-endian
const SQUARE_BYTES = 512;
const HEADER_BYTES = 8;
const INDEX_BYTES = 4;
/** An index row spends one byte on each of mx and mz, so a square coordinate has to fit one. */
const MAX_SQUARE_COORD = 255;
/** The header's square count is a u16. */
const MAX_SQUARES = 65535;

export function encodeCollision(squares: EncodedSquare[]): Uint8Array {
  for (const s of squares) {
    if (s.mx < 0 || s.mx > MAX_SQUARE_COORD || s.mz < 0 || s.mz > MAX_SQUARE_COORD) {
      throw new Error(`map square ${s.mx}_${s.mz} does not fit the index row (0..${MAX_SQUARE_COORD} per axis)`);
    }
    for (const [level, bits] of s.levels) {
      if (level < 0 || level > 3) throw new Error(`map square ${s.mx}_${s.mz} has level ${level}, outside 0..3`);
      if (bits.byteLength !== SQUARE_BYTES) {
        throw new Error(`map square ${s.mx}_${s.mz} level ${level} is ${bits.byteLength} bytes, not ${SQUARE_BYTES}`);
      }
    }
  }

  const rows = [...squares]
    .sort((a, b) => a.mx - b.mx || a.mz - b.mz)
    .map(s => {
      const levels = [...s.levels.entries()].sort((a, b) => a[0] - b[0]);
      return {
        mx: s.mx,
        mz: s.mz,
        present: levels.reduce((mask, [level]) => mask | (1 << level), 0),
        // Three quarters of the map has nothing above level 0, and an empty level costs 512
        // bytes for no information. It stays allocated; only its bytes go.
        stored: levels.filter(([, bits]) => bits.some(b => b !== 0))
      };
    })
    .filter(r => r.present !== 0);
  if (rows.length > MAX_SQUARES) throw new Error(`${rows.length} map squares does not fit the u16 count`);

  const payloadBytes = rows.reduce((n, r) => n + r.stored.length * SQUARE_BYTES, 0);
  const out = new Uint8Array(HEADER_BYTES + rows.length * INDEX_BYTES + payloadBytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  out[4] = 1;
  view.setUint16(6, rows.length, true);
  let index = HEADER_BYTES;
  let payload = HEADER_BYTES + rows.length * INDEX_BYTES;
  for (const row of rows) {
    out[index] = row.mx;
    out[index + 1] = row.mz;
    out[index + 2] = row.present;
    out[index + 3] = row.stored.reduce((mask, [level]) => mask | (1 << level), 0);
    index += INDEX_BYTES;
    for (const [, bits] of row.stored) { out.set(bits, payload); payload += SQUARE_BYTES; }
  }
  return out;
}

export function decodeCollision(buffer: ArrayBuffer): CollisionGrid {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.byteLength < HEADER_BYTES || view.getUint32(0, true) !== MAGIC) {
    throw new Error('not a collision file (bad magic)');
  }
  const count = view.getUint16(6, true);
  /** `(mx << 8) | mz` to its present mask and, per level, the payload offset or -1. */
  const squares = new Map<number, { present: number; offsets: number[] }>();
  let payload = HEADER_BYTES + count * INDEX_BYTES;
  for (let i = 0; i < count; i++) {
    const at = HEADER_BYTES + i * INDEX_BYTES;
    const stored = bytes[at + 3];
    const offsets: number[] = [];
    for (let level = 0; level < 4; level++) {
      if ((stored & (1 << level)) === 0) { offsets.push(-1); continue; }
      offsets.push(payload);
      payload += SQUARE_BYTES;
    }
    squares.set((bytes[at] << 8) | bytes[at + 1], { present: bytes[at + 2], offsets });
  }
  if (payload > bytes.byteLength) {
    throw new Error(`not a collision file (truncated: ${payload} bytes of payload in ${bytes.byteLength})`);
  }

  const rowFor = (x: number, z: number) => squares.get(((x >> 6) << 8) | (z >> 6));

  return {
    squareCount: count,
    hasSquare(level, x, z) {
      if (level < 0 || level > 3) return false;
      const row = rowFor(x, z);
      return row !== undefined && (row.present & (1 << level)) !== 0;
    },
    blocked(level, x, z) {
      if (level < 0 || level > 3) return false;
      const offset = rowFor(x, z)?.offsets[level] ?? -1;
      if (offset < 0) return false;
      const i = ((x & 0x3f) << 6) | (z & 0x3f);
      return (bytes[offset + (i >> 3)] & (1 << (i & 7))) !== 0;
    }
  };
}
