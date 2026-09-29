// The Master Chef, the jukebox, and the run toggle that the next door is gated on.
//
// Two of these steps flash a sidebar tab under a title that reads like prose rather than an
// instruction ("Well done, your first loaf of bread..." flashes the music tab, and "It's only a
// short distance to the next guide." flashes the player controls), which is why they are tab
// steps here and not `advanceStep`s.
import { advanceStep, flashingTab, tabStep, titleIs } from './helpers';
import { T } from './titles';
import type { Task } from '../../types';

/**
 * The run-on button in the player controls panel. `[if_button,controls:com_5]` in
 * `engine/content/scripts/interface_controls/scripts/player_controls.rs2` is the handler that
 * sets `^tutorial_has_toggled_on_run`, and `engine/content/pack/interface.pack` maps
 * `controls:com_5` to component 153. The door to the quest guide refuses to open until that varp
 * moves, so this is the one step on the island that no amount of hint-following can replace.
 */
const RUN_ON_COMPONENT = 153;

const DOUGH_WAIT_MS = 30_000;

export const TASKS: Task[] = [
  {
    name: 'make-dough',
    when: s => titleIs(s, T.makingDough),
    timeoutMs: 60_000,
    async run(c) {
      c.status('Mixing dough');
      const inventory = c.state().inventory ?? [];
      const water = inventory.find(i => /bucket of water/i.test(i.name ?? ''));
      const flour = inventory.find(i => /pot of flour/i.test(i.name ?? ''));
      if (!water || !flour) return { success: false, message: 'the chef has not handed over the ingredients yet', reason: 'not_found' };
      const r = await c.sdk.sendUseItemOnItem(water.slot, flour.slot);
      if (!r.success) return r;
      await c.wait.item('Bread dough', 1, DOUGH_WAIT_MS);
    }
  },
  {
    // The baking step publishes no title at all, only a hint arrow at the range. Keying on the
    // dough in the inventory rather than on the arrow keeps it from firing on any of the
    // island's other untitled steps.
    name: 'bake-bread',
    when: s => titleIs(s, '') && (s.inventory ?? []).some(i => /bread dough/i.test(i.name ?? '')),
    timeoutMs: 60_000,
    async run(c) {
      c.status('Baking the bread');
      const r = await c.bot.useItemOnLoc('Bread dough', 'Range');
      if (!r.success) return r;
      await c.wait.item('Bread', 1, DOUGH_WAIT_MS);
    }
  },
  tabStep('open-music-tab', s => titleIs(s, T.firstLoaf), { status: 'Opening the music player' }),
  advanceStep('leave-the-kitchen', s => titleIs(s, T.theMusicPlayer), { status: 'Leaving through the kitchen door' }),
  tabStep('open-controls-tab', s => titleIs(s, T.shortDistanceToTheNextGuide), { status: 'Opening the player controls' }),
  {
    name: 'enable-run',
    /**
     * `Running.` is a title a real player never sees. `[proc,tutorial_step_enable_run]` in
     * `engine/content/scripts/tutorial/scripts/tut_chatbox_steps.rs2` opens with
     * `if (p_finduid(uid) = true) { p_run(^player_run_off); return; }` and only reaches its
     * `~tutorialstep` on the fallback arm, so the tutorial box keeps the previous step's text
     * while `%tutorial` has already moved to `^tutorial_open_player_controls`. What the run
     * sees at that point is the short-distance title with nothing flashing, because opening
     * the controls tab cleared the flash. The title is still matched first, for the fallback
     * arm and for a re-display.
     */
    when: s => titleIs(s, T.running) || (titleIs(s, T.shortDistanceToTheNextGuide) && flashingTab(s) === null),
    timeoutMs: 30_000,
    async run(c) {
      c.status('Turning running on');
      const r = await c.sdk.sendClickComponent(RUN_ON_COMPONENT);
      if (!r.success) return r;
      // Either title moving on is the step advancing: the next one is `Run to the next guide.`
      await c.wait.until(s => !titleIs(s, T.running) && !titleIs(s, T.shortDistanceToTheNextGuide),
        { timeoutMs: 15_000, label: 'enable-run' });
    }
  },
  advanceStep('run-to-the-next-guide', s => titleIs(s, T.runToTheNextGuide), {
    status: 'Following the path to the quest guide'
  })
];
