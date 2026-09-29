---
type: mechanic
slug: coordinates
title: Coordinates
lead: **Coordinates** on this wiki are given as an absolute (x, z, level) tile position, the same system the engine uses internally.
sources:
  lead: engine:src/engine/CoordGrid.ts
---
## Details

`x` and `z` are absolute tile positions on the game map and `level` is the floor (0 ground
floor up to 3). Scripts and map filenames instead write a coordinate in packed form,
`level_mx_mz_lx_lz`: `mx` and `mz` are the map square the tile falls in and `lx` and `lz` are
the tile's position local to that square, so the absolute position is `x = mx * 64 + lx` and
`z = mz * 64 + lz`. <!-- src: engine:src/engine/CoordGrid.ts -->

Map squares are 64 by 64 tiles; map data is split into one `.jm2` file per square, named
`m<mx>_<mz>.jm2`, and each map square divides further into 8 by 8 tile zones, the unit the
engine tracks entity presence and script activity by. <!-- src: engine:src/engine/CoordGrid.ts --> <!-- src: content:maps -->

Named areas on this wiki (used for "location" fields and the nearest-area lookups) come from
the engine's own area label file, which gives each label a centre coordinate and a size that
sets how far the label's name reaches. <!-- src: content:maps/labels.txt -->
