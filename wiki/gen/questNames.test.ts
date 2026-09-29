import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { QUEST_NAMES } from './questNames';
import { CONTENT } from './paths';

describe('QUEST_NAMES', () => {
  test('every quest folder in the content clone has an entry and no two folders share a name', () => {
    const folders = readdirSync(path.join(CONTENT, 'scripts', 'quests'), { withFileTypes: true }).filter(d => d.isDirectory() && d.name.startsWith('quest_')).map(d => d.name);
    expect(folders.filter(f => !(f in QUEST_NAMES))).toEqual([]);
    const names = Object.values(QUEST_NAMES).filter((n): n is string => n !== null);
    expect(new Set(names).size).toBe(names.length);
  });
});
