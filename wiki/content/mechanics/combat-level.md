---
type: mechanic
slug: combat-level
title: Combat level
lead: The **Combat level** is a single number derived from a player's or NPC's attack, strength, defence, hitpoints, ranged, magic and prayer levels.
sources:
  lead: engine:src/engine/entity/Player.ts#getCombatLevel
---
## Details

The server computes a player's combat level as `floor(base + max(melee, range, magic))`, where
`base = 0.25 * (defence + hitpoints + floor(prayer / 2))`, `melee = 0.325 * (attack +
strength)`, `range = 0.325 * (floor(ranged / 2) + ranged)`, and `magic` is the same expression
as `range` using the magic level. <!-- src: engine:src/engine/entity/Player.ts#getCombatLevel -->
A new account starts with every skill at level 1 except hitpoints, which starts at level 10.
<!-- src: engine:src/engine/entity/PlayerLoading.ts#load --> For those levels, `base` is
`0.25 * (1 + 10 + 0) = 2.75`, `melee` is `0.325 * (1 + 1) = 0.65`, and `range` and `magic` are
both `0.325 * (0 + 1) = 0.325`; the highest of the three combat styles is `melee` at `0.65`, so
the combat level is `floor(2.75 + 0.65) = 3`, matching the combat level a fresh account shows
in-game. <!-- src: engine:src/engine/entity/Player.ts#getCombatLevel -->

NPCs use the same formula applied to their config stats, but without a prayer term, since NPC
configs carry no prayer stat. This wiki shows an NPC's `vislevel` config value as its combat
level when the config sets one; otherwise it shows the level computed by that formula.
<!-- src: derived:npcs.ts:npcCombatLevel -->
