---
type: mechanic
slug: game-tick
title: Game tick
lead: The **Game tick** is the 600 millisecond cycle the server runs the game world on.
sources:
  lead: engine:src/engine/World.ts#TICKRATE
---
## Details

Every server action resolves on a tick boundary: movement, combat, skilling ticks and script
timers all advance once per tick rather than continuously. <!-- src: engine:src/engine/World.ts#TICKRATE -->
A walking player or NPC advances one tile per tick; a running player advances two tiles in
the same tick, since the engine processes an extra step when running is active.
<!-- src: engine:src/engine/entity/PathingEntity.ts#processMovement -->
NPC respawn timers are stored and counted in ticks: the `respawnrate` config field defaults
to 100, documented in the engine as "1-minute", which is 100 ticks at 600 milliseconds each.
<!-- src: engine:src/cache/config/NpcType.ts#respawnrate -->

## Conversions

A duration given in ticks converts to seconds by multiplying by 0.6, the tick length in the
table below. <!-- src: engine:src/engine/World.ts#TICKRATE -->

| Ticks | Seconds |
|---|---|
| 1 | 0.6 |
| 5 | 3 |
| 10 | 6 |
| 25 | 15 |
| 50 | 30 |
| 100 | 60 |
