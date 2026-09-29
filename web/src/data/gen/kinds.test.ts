import { expect, test } from 'vitest';
import { parseConfigText } from './configs';
import { isFishingSpot, KIND_META, locKind, variantOf } from './kinds';

const blocks = parseConfigText(`
[tree]
name=Tree
op1=Chop down
category=tree

[rock_copper]
name=Rocks
op1=Mine
category=mining_rock_normal

[bank_booth]
name=Bank booth
op2=Use-quickly

[furnace]
name=Furnace
category=smithing_furnace

[anvil]
name=Anvil
op1=Smith

[fire]
name=Fire
category=cooking_fire

[chair]
name=Chair
op1=Sit-on
`);

test('every kind is classified from the content, not from a hardcoded id list', () => {
  expect(locKind(blocks.get('tree')!)).toBe('tree');
  expect(locKind(blocks.get('rock_copper')!)).toBe('rock');
  expect(locKind(blocks.get('bank_booth')!)).toBe('bank');
  expect(locKind(blocks.get('furnace')!)).toBe('furnace');
  expect(locKind(blocks.get('anvil')!)).toBe('anvil');
  expect(locKind(blocks.get('fire')!)).toBe('fire');
});

test('anything not in the taxonomy is left out of the atlas', () => {
  expect(locKind(blocks.get('chair')!)).toBeNull();
});

test('a bank is something you bank at, not the furniture the content names after one', () => {
  const furniture = parseConfigText(`
[banknoticeboard]
name=Bank notice board

[banktable]
name=Bank table
category=unusable_table

[duel_chestopen]
name=Open chest
op2=Bank
op3=Shut
`);
  expect(locKind(furniture.get('banknoticeboard')!)).toBeNull();
  expect(locKind(furniture.get('banktable')!)).toBeNull();
  expect(locKind(furniture.get('duel_chestopen')!)).toBe('bank');
});

test('a fishing spot is an npc config, matched by name or by a fishing op', () => {
  const npcs = parseConfigText(`
[0_43_51_saltfish]
name=Fishing spot
op1=Net
op2=Bait

[hans]
name=Hans
op1=Talk-to
`);
  expect(isFishingSpot(npcs.get('0_43_51_saltfish')!)).toBe(true);
  expect(isFishingSpot(npcs.get('hans')!)).toBe(false);
});

test('the variant is the debug name, which is what a script filters on', () => {
  expect(variantOf('0_43_51_saltfish')).toBe('saltfish');
  expect(variantOf('oaktree')).toBe('oaktree');
});

test('every kind declares the op a script interacts with', () => {
  for (const kind of Object.keys(KIND_META)) {
    expect(KIND_META[kind as keyof typeof KIND_META].op.length).toBeGreaterThan(0);
  }
});
