// Every step title the script keys on, in one place. The stage modules match through `T`, never
// through a literal of their own, so `MATCHED_TITLES` is the whole contract with the content and
// `steps.test.ts` can check it against the generated `TUTORIAL_STEPS` without anything drifting.
//
// The values are the engine's own wording (`~tutorialstep("<title>", ...)`), punctuation and all.

export const T = {
  // The Gielinor Guide, in the first room.
  gettingStarted: 'Getting started',
  playerControls: 'Player controls',
  interactingWithScenery: 'Interacting with scenery',
  movingAround: 'Moving around',
  // Every stage has at least one of these: the server is doing something and the bot must not.
  pleaseWait: 'Please wait...',

  // The Survival Expert.
  viewingItems: 'Viewing the items that you were given.',
  cutDownATree: 'Cut down a tree',
  buildingAFire: 'Building a fire',
  gainedExperience: 'You gained some experience...',
  theseAreYourStats: 'These are your stats.',
  catchSomeShrimp: 'Catch some Shrimp.',
  cookingYourShrimp: 'Cooking your shrimp.',
  burningYourShrimp: 'Burning your shrimp.',
  firstMeal: "Well done, you've just cooked your first RuneScape meal.",
  findYourNextInstructor: 'Find your next instructor.',

  // The Master Chef, then the door to the quest guide.
  makingDough: 'Making dough.',
  firstLoaf: 'Well done, your first loaf of bread. As you gain experience in',
  theMusicPlayer: 'The Music Player.',
  shortDistanceToTheNextGuide: "It's only a short distance to the next guide.",
  running: 'Running.',
  runToTheNextGuide: 'Run to the next guide.',

  // The mine, reached by the quest guide's ladder.
  miningAndSmithing: 'Mining and smithing.',
  prospecting: 'Prospecting',
  itsCopper: "It's copper.",
  itsTin: "It's tin.",
  mining: 'Mining.',
  smelting: 'Smelting.',
  bronzeBar: "You've made a bronze bar!",
  smithingADagger: 'Smithing a dagger.',
  finishedThisArea: "You've finished this area.",

  // The Combat Instructor.
  combat: 'Combat.',
  wornInventory: 'This is your worn inventory.',
  holdingYourDagger: "You're now holding your dagger.",
  unequippingItems: 'Unequipping items.',
  combatInterface: 'Combat interface.',
  thisIsYourCombatInterface: 'This is your Combat interface.',
  attacking: 'Attacking.',
  sitBackAndWatch: 'Sit back and watch.',
  firstKill: "Well done, you've made your first kill!",
  ratRanging: 'Rat ranging.',
  movingOn: 'Moving on.',

  // The bank, the chapel, and the wizard who ends the island.
  banking: 'Banking.',
  bankBox: 'This is your bank box.',
  financialAdvice: 'Financial advice.',
  friendsList: 'This is your friends list.',
  ignoreList: 'This is your ignore list.',
  finalInstructor: 'Your final instructor!',
  openUpYourFinalMenu: 'Open up your final menu.',
  castWindStrike: 'Cast Wind Strike at a chicken.',
  almostCompleted: 'You have almost completed the tutorial!'
} as const;

/**
 * Every title above, as the flat list `steps.test.ts` checks against the content. A title that a
 * content bump renames stops being in `TUTORIAL_STEPS` and fails that test, which is the only
 * warning anyone gets before the script sits on the island for its whole 25 minute estimate.
 */
export const MATCHED_TITLES: readonly string[] = Object.values(T);
