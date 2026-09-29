/**
 * Quest folder -> display name, targeting content revision 274. Source: content:scripts/general/configs/quest.enum#quest_names_enum
 * joined to folder names (editorial), then verified against each folder's own
 * `send_quest_complete(...)` message and `send_quest_progress(questlist:<component>, ...)` component.
 *
 * Corrections made during verification (see task-8-report.md for full evidence):
 * - quest_haunted is "Ernest the Chicken" (its completion message reads "...Ernest The Chicken Quest!"),
 *   not "The Restless Ghost".
 * - quest_priest is "The Restless Ghost" (its completion message reads "...Restless Ghost Quest!"),
 *   not "Priest in Peril" (which has no folder and no quest.enum entry in the 225 content clone --
 *   274 adds it as its own folder, quest_priestperil, see below).
 * - quest_hunt is "Pirate's Treasure" (its completion message reads "...Pirate's Treasure Quest!").
 * - quest_zombiequeen is "Shilo Village" (its completion message reads "...Shilo Village Quest!"),
 *   freeing "Pirate's Treasure" for quest_hunt and resolving the quest_hunt/quest_scorpcatcher clash
 *   (quest_scorpcatcher's own message confirms it is "Scorpion Catcher").
 * - quest_barcrawl (Alfred Grimhand's Barcrawl) has no `send_quest_complete`/`send_quest_progress`
 *   call and no entry in quest_names_enum -- it is a miniquest tracked only via a varp bitfield, not
 *   the quest journal/points system the other quests use -- so it maps to null and is skipped.
 *
 * Rows added for revision 274 (11 quest folders that did not exist in the 225 content clone).
 * `quest.enum` in the 274 clone re-checked in full: entries 0-51 are unchanged from 225 (same
 * typos/casing already corrected above), so no existing row needed a rename; entries 52-62 are new
 * and back these 11 additions. Evidence per folder (completion message, cross-checked against the
 * matching quest.enum val=N entry):
 * - quest_death is "Death Plateau" (`scripts/quest_death.rs2`: "...completed\nDeath Plateau!"; enum val=55).
 * - quest_druidspirit is "Nature Spirit" (`quest_druidspirit.rs2`: "...completed the 'Nature Spirit' Quest!"; enum val=53).
 * - quest_eadgar is "Eadgar's Ruse" (`quest_eadgar.rs2`: "...completed\nEadgars Ruse!" -- missing the
 *   apostrophe in the in-game text; corrected per enum val=59, "Eadgar's Ruse").
 * - quest_elemental_workshop is "Elemental Workshop" (`quest_elemental_workshop.rs2`: "...completed the\nElemental
 *   Workshop Quest!" with the "Quest" suffix dropped per the same convention as quest_itexam/"The Dig Site" etc.; enum val=52).
 * - quest_horror is "Horror from the Deep" (`quest_horror.rs2`: "...survived the\nHorror From The Deep!";
 *   casing normalized to enum val=62, "Horror from the Deep").
 * - quest_mortton is "Shades of Mort'ton" (`quest_mortton.rs2`: "'Shades of Mort'ton' Quest Complete!" --
 *   the in-game text already carries the town's apostrophe; enum val=60 drops it to "Shades of Mortton",
 *   but the completion message is the more precise source here).
 * - quest_priestperil is "Priest in Peril" (`priestperil.rs2`: "...completed the\nPriest In Peril Quest!"
 *   with the "Quest" suffix dropped and "in" lowercased per standard title casing; enum val=54, "Priest In Peril").
 * - quest_regicide is "Regicide" (`quest_regicide.rs2`: "...completed the\nRegicide Quest!"; enum val=58).
 * - quest_tbwt is "Tai Bwo Wannai Trio" (`quest_tbwt.rs2`: "...completed the\n'Tai Bwo Wannai Trio' Quest!"; enum val=57).
 * - quest_troll is "Troll Stronghold" (`quest_troll.rs2`: "...completed\nTroll Stronghold!"; enum val=56).
 * - quest_viking is "The Fremennik Trials" (`quest_viking.rs2`: "...completed the\nTrials of the Fremmenik
 *   Quest!" -- "Fremmenik" is a developer typo for "Fremennik"; enum val=61 gives the corrected spelling
 *   as "Fremennik Trials" but drops the article -- "The Fremennik Trials" is the quest's well-known title).
 */
export const QUEST_NAMES: Record<string, string | null> = {
  quest_arena: 'Fight Arena', quest_arthur: "Merlin's Crystal", quest_ball: "Witch's House", quest_barcrawl: null,
  quest_biohazard: 'Biohazard', quest_blackarmgang: 'Shield of Arrav', quest_blackknight: "Black Knight's Fortress", quest_chompybird: 'Big Chompy Bird Hunting',
  quest_cog: 'Clock Tower', quest_cook: "Cook's Assistant", quest_crest: 'Family Crest', quest_death: 'Death Plateau', quest_demon: 'Demon Slayer',
  quest_desertrescue: 'The Tourist Trap', quest_doric: "Doric's Quest", quest_dragon: 'Dragon Slayer', quest_druid: 'Druidic Ritual', quest_druidspirit: 'Nature Spirit',
  quest_drunkmonk: "Monk's Friend", quest_eadgar: "Eadgar's Ruse", quest_elemental_workshop: 'Elemental Workshop', quest_elena: 'Plague City',
  quest_fishingcompo: 'Fishing Contest', quest_fluffs: "Gertrude's Cat", quest_gobdip: 'Goblin Diplomacy', quest_grail: 'Holy Grail', quest_grandtree: 'The Grand Tree',
  quest_haunted: 'Ernest the Chicken', quest_hazeelcult: 'Hazeel Cult', quest_hero: "Heroes' Quest", quest_hetty: "Witch's Potion", quest_horror: 'Horror from the Deep',
  quest_hunt: "Pirate's Treasure", quest_ikov: 'Temple of Ikov', quest_imp: 'Imp Catcher', quest_itexam: 'The Dig Site', quest_itgronigen: 'Observatory Quest',
  quest_itwatchtower: 'Watchtower', quest_junglepotion: 'Jungle Potion', quest_legends: "Legends' Quest", quest_mcannon: 'Dwarf Cannon', quest_mortton: "Shades of Mort'ton",
  quest_murder: 'Murder Mystery', quest_priest: 'The Restless Ghost', quest_priestperil: 'Priest in Peril', quest_prince: 'Prince Ali Rescue',
  quest_regicide: 'Regicide', quest_romeojuliet: 'Romeo & Juliet', quest_runemysteries: 'Rune Mysteries', quest_scorpcatcher: 'Scorpion Catcher',
  quest_seaslug: 'Sea Slug', quest_sheep: 'Sheep Shearer', quest_sheepherder: 'Sheep Herder', quest_squire: "The Knight's Sword", quest_tbwt: 'Tai Bwo Wannai Trio',
  quest_totem: 'Tribal Totem', quest_tree: 'Tree Gnome Village', quest_troll: 'Troll Stronghold', quest_upass: 'Underground Pass', quest_vampire: 'Vampire Slayer',
  quest_viking: 'The Fremennik Trials', quest_waterfall: 'Waterfall Quest', quest_zanaris: 'Lost City', quest_zombiequeen: 'Shilo Village'
};
