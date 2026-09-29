---
type: quest
key: quest_cook
infobox:
  Length: Very short
  Difficulty: Novice
sources:
  Length: editorial:cs:2026-09-05
  Difficulty: editorial:cs:2026-09-05
# Length and Difficulty: a 2004/2005 tip.it or RuneHQ quest guide snapshot was sought via the
# Wayback Machine for these two rows, as the brief asks. The archive.org availability API
# (fetchable) confirms tip.it's own site has snapshots from December 2004, but web.archive.org
# itself — which serves the actual archived page content, including any specific quest-guide
# page found through it — is blocked for this session's fetch tool, so no snapshot text could
# be read to confirm a period source. Falling back to editorial:cs:2026-09-05 per correction 3.
---
## Walkthrough

1. Talk to the [[Cook]], found at (3209, 3215, 0) in Lumbridge Castle. Keep talking; most of his answers eventually lead him to admit something is wrong, and when he asks for help, agree — this starts the quest. <!-- src: content:maps/m50_50.jm2#NPC --> <!-- src: content:scripts/quests/quest_cook/scripts/quest_cook.rs2#cooks_assistant_start --> <!-- src: content:scripts/quests/quest_cook/scripts/quest_cook.rs2#cooks_assistant_whats_wrong -->
2. He needs a [[Bucket of milk]], an [[Egg]] and a [[Pot of flour]] for the Duke's birthday cake and asks you to fetch them. <!-- src: content:scripts/quests/quest_cook/scripts/quest_cook.rs2#cooks_assistant_whats_wrong -->
3. For the milk: use an empty bucket on a dairy cow to milk it. An empty bucket is spawned in the field north of the castle at (3225, 3294, 0), and a cow stands in the same field at (3243, 3295, 0). <!-- src: content:scripts/npc/scripts/cow_milking.rs2#milk_cow --> <!-- src: content:maps/m50_51.jm2#OBJ --> <!-- src: content:maps/m50_51.jm2#NPC -->
4. For the egg: pick one up from the same field, where an egg is spawned at (3226, 3301, 0). <!-- src: content:maps/m50_51.jm2#OBJ -->
5. For the flour: fill an empty pot from a windmill's flour bin. If the bin is empty, put grain in the hopper upstairs and pull the lever to mill it first. <!-- src: content:scripts/general_use/scripts/windmills.rs2#take_flour_bin -->
6. If you return to the cook with only some of the three, he tells you which ones you still need. <!-- src: content:scripts/quests/quest_cook/scripts/quest_cook.rs2#cooks_assistant_inprogress -->
7. Once you are carrying milk, an egg and flour together, talk to the cook again; he takes them from you and finishes the cake. <!-- src: content:scripts/quests/quest_cook/scripts/quest_cook.rs2#cooks_assistant_completion -->
8. The quest completes: you keep the cake and receive cooking experience and a quest point. <!-- src: content:scripts/quests/quest_cook/scripts/quest_cook.rs2#cooks_quest_complete -->

## Trivia

The cake the cook hands over on completion examines as "A plain sponge cake." <!-- src: content:scripts/skill_cooking/configs/cooking_inv/configs/cakes/cakes.obj#cake -->
