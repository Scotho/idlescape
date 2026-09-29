import { describe, expect, test } from 'bun:test';
import { parseRs2 } from './rs2';

const SRC = `[opnpc1,cook]
// https://www.youtube.com/watch?v=mtPhS3n2dAo
if(%cookquest = 0) {
    @cooks_assistant_start;
}

[proc,randomherb]()(namedobj, int)
def_int $random = random(128);
return (unidentified_guam, 1);

[label,cooks_assistant_completion]
%cookquest = ^cook_complete;
`;

describe('parseRs2', () => {
  const blocks = parseRs2(SRC, 'scripts/x.rs2');
  test('splits on headers at column 0 and keeps trigger, subject and params', () => {
    expect(blocks.map(b => [b.trigger, b.subject])).toEqual([['opnpc1', 'cook'], ['proc', 'randomherb'], ['label', 'cooks_assistant_completion']]);
    expect(blocks[1]!.params).toBe('()(namedobj, int)');
    expect(blocks[0]!.line).toBe(1);
  });
  test('bodies exclude the header and citations are harvested', () => {
    expect(blocks[0]!.body).toContain('@cooks_assistant_start;');
    expect(blocks[0]!.citations).toEqual(['https://www.youtube.com/watch?v=mtPhS3n2dAo']);
    expect(blocks[2]!.body.trim()).toBe('%cookquest = ^cook_complete;');
  });
});
