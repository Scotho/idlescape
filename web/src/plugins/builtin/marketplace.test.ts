// web/src/plugins/builtin/marketplace.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { createMarketplacePlugin, createMarketplaceView, filterCatalogue, renderMarketCard } from './marketplace';
import { TUTORIAL_REGION_IDS } from '../../tasks/library/regions';
import type { PluginContext } from '../types';
import type { TasksApi } from '../../tasks/api';
import type { TaskSummary } from '../../tasks/types';
import type { WorldState } from '../../agent/types';

const automationCss = (): string => readFileSync(resolve(process.cwd(), 'src/styles/layout/automation.css'), 'utf8');

/** The declarations of one base rule, by exact selector. The reader tasksViews.test.ts uses. */
function baseRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!found) throw new Error(`no base rule for ${selector} in layout/automation.css`);
  return found[1];
}

const t = (id: string, name: string, tags: string[] = [], order = 10): TaskSummary => ({
  id, name, description: 'd', version: 1, tags, source: 'library' as const, params: {},
  requirements: { ok: true, missing: [] }, order, estimateMinutes: 20, enabled: true
});

function ctx(): PluginContext {
  return {
    client: () => null,
    settings: { get: (() => undefined) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null
  };
}

function fakeApi(over: Partial<TasksApi> = {}): TasksApi {
  const base: Partial<TasksApi> = {
    list: async () => [],
    install: vi.fn(async () => ({ id: 'x' })),
    run: vi.fn(async () => ({ runId: 'run-1' })),
    getState: () => null
  };
  return { ...base, ...over } as unknown as TasksApi;
}

/** Mounts the panel and lets the initial `list()` settle. */
async function mount(api: TasksApi | null, c: PluginContext = ctx(), showMyTasks?: () => void): Promise<HTMLElement> {
  const view = createMarketplaceView(c, { api: () => api!, hasSession: () => api !== null, openPanel: c.openPanel, showMyTasks });
  const body = document.createElement('div');
  view.mount(body);
  await Promise.resolve();
  await Promise.resolve();
  return body;
}

// `MarketCardHandlers` carries three members and these fixtures named two, which is the drift a
// typechecked test suite exists to catch. Built by a factory so the fourth costs one edit, and
// left unannotated so each member stays a vitest mock the assertions can interrogate. Audit C16.
const cardHandlers = () => ({ run: vi.fn(), install: vi.fn(), openTasks: vi.fn() });

describe('market card', () => {
  test('shows name, tags, estimate, requirements and both actions', () => {
    const el = renderMarketCard(
      { ...t('chop-and-drop', 'Chop and drop', ['skilling']), requirements: { ok: false, missing: ['Needs a bronze axe'] } },
      { installed: false, startHere: false },
      cardHandlers()
    );
    expect(el.textContent).toContain('Chop and drop');
    expect(el.textContent).toContain('skilling');
    expect(el.textContent).toContain('20 min');
    expect(el.textContent).toContain('v1');
    expect(el.textContent).toContain('Needs a bronze axe');
    expect(el.querySelector('[data-market-run]')).not.toBeNull();
    expect(el.querySelector('[data-market-install]')?.textContent).toBe('Add to my tasks');
  });

  test('the version is shown so the catalogue and the Tasks tab agree on the revision', () => {
    const el = renderMarketCard({ ...t('chop-and-drop', 'Chop and drop'), version: 7 }, { installed: false, startHere: false }, cardHandlers());
    expect(el.querySelector('.market-meta')?.textContent).toContain('v7');
  });

  test('installed cards say Added; start-here badge appears when asked', () => {
    const el = renderMarketCard(t('tutorial-island', 'Tutorial Island', ['starter'], 0), { installed: true, startHere: true }, cardHandlers());
    // The mock's own label. The tick is a state mark inside a drawn control, which ruling R19
    // keeps; the decorative glyph it drops is the requirement line's warning sign.
    expect(el.querySelector('[data-market-install]')?.textContent).toBe('Added ✓');
    expect((el.querySelector('[data-market-install]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.textContent).toContain('Start here');
  });

  test('is a lifting card whose tags are Tags and whose buttons are the card geometry', () => {
    const el = renderMarketCard(t('chop-and-drop', 'Chop and drop', ['skilling', 'woodcutting']), { installed: false, startHere: false }, cardHandlers());
    expect(el.className).toBe('card card-lift market-card');
    // A tag is a quiet noun; a badge is a status. The catalogue's `skilling` is a noun, and it
    // rendered as a neutral badge until Task 15.
    expect([...el.querySelectorAll('.market-meta .tag')].map(n => n.textContent)).toEqual(['skilling', 'woodcutting']);
    expect(el.querySelectorAll('.market-meta .badge')).toHaveLength(0);
    expect(el.querySelector('[data-market-run]')?.className).toBe('btn btn-primary btn-sm btn-in-card');
    expect(el.querySelector('[data-market-install]')?.className).toBe('btn btn-sm');
  });

  test('the requirement is the warn alert, and a turned-off script still says where its switch is', () => {
    const missing = renderMarketCard({ ...t('chop-and-drop', 'Chop and drop'), requirements: { ok: false, missing: ['Needs a bronze axe in your inventory or equipped'] } }, { installed: false, startHere: false }, cardHandlers());
    expect(missing.querySelector('.alert-warn')?.textContent).toContain('bronze axe');
    // SP4b Task 9's disabled-script alert and Task 10's copy for it are restyled, never rewritten.
    const off = renderMarketCard({ ...t('chop-and-drop', 'Chop and drop'), enabled: false }, { installed: false, startHere: false }, cardHandlers());
    expect(off.textContent).toContain('Turn it back on under My tasks.');
    expect(off.querySelector('[data-market-run]')?.textContent).toBe('Open My tasks');
  });

  test('the card carries its id and its buttons call the handlers', () => {
    const handlers = cardHandlers();
    const el = renderMarketCard(t('mine-and-drop', 'Mine and drop'), { installed: false, startHere: false }, handlers);
    expect(el.getAttribute('data-market-card')).toBe('mine-and-drop');
    el.querySelector<HTMLButtonElement>('[data-market-run]')!.click();
    el.querySelector<HTMLButtonElement>('[data-market-install]')!.click();
    expect(handlers.run).toHaveBeenCalledWith('mine-and-drop');
    expect(handlers.install).toHaveBeenCalledWith('mine-and-drop');
  });
});

describe('filterCatalogue', () => {
  test('orders by order then name and filters by name or tag', () => {
    const items = [t('b', 'Bravo', ['mining'], 20), t('a', 'Alpha', ['fishing'], 10), t('c', 'Charlie', ['mining'], 20)];
    expect(filterCatalogue(items, '').map(i => i.id)).toEqual(['a', 'b', 'c']);
    expect(filterCatalogue(items, 'min').map(i => i.id)).toEqual(['b', 'c']);
    expect(filterCatalogue(items, 'alp').map(i => i.id)).toEqual(['a']);
  });
});

describe('tutorial regions', () => {
  test('the six Tutorial Island map squares are packed as (mx << 8) | mz', () => {
    expect([...TUTORIAL_REGION_IDS].sort((a, b) => a - b)).toEqual([12079, 12080, 12335, 12336, 12436, 12592]);
  });
});

describe('marketplace panel', () => {
  // G4: the plugin keeps its id, its manifest and its view, and loses its strip button. Losing
  // the button is the assertion here; the icon is only along for the ride.
  //
  // `alwaysOn` is the second half of losing it. Nothing reads this plugin's enabled state any
  // more - the Automation panel builds `createMarketplaceView` in its own `panel()` closure - so
  // without `alwaysOn` the Plugins panel draws a live switch that removes no button, hides no
  // panel and calls no `onDisable`: a control that does nothing at all.
  test('the plugin keeps its manifest, declares no panel, and is not switchable', () => {
    const p = createMarketplacePlugin();
    expect(p.manifest).toMatchObject({
      id: 'marketplace', name: 'Marketplace', icon: 'automation', tier: 'shell',
      defaultEnabled: true, alwaysOn: true
    });
    expect(p.panel).toBeUndefined();
    expect(typeof createMarketplaceView).toBe('function');
  });

  test('the tab is one 10px column holding the search box and the list, and nothing adds a margin', async () => {
    // The mock's Marketplace is a single `gap:10px` column. Under `.stack` (8px) plus a
    // `margin-top` on the list the two added to 18px above the first card, which is the shape
    // this case exists to keep out: one owner per gap, and the column is it.
    const body = await mount(fakeApi({ list: async () => [] }));
    const tab = body.querySelector('.market-tab')!;
    expect(Array.from(tab.children).map(c => c.className)).toEqual(['input input-lg', 'market-list']);
    const css = automationCss();
    expect(baseRule(css, '.market-tab')).toContain('gap: var(--sp-6)');
    expect(baseRule(css, '.market-list')).toContain('gap: var(--sp-6)');
    expect(baseRule(css, '.market-list')).not.toContain('margin');
  });

  test('lists library rows only, folding in the installed flag', async () => {
    const rows: TaskSummary[] = [
      { ...t('chop-and-drop', 'Chop and drop', ['skilling'], 10), installed: true },
      { ...t('mine-and-drop', 'Mine and drop', ['mining'], 20) },
      { ...t('my-own', 'My own', [], 1000), source: 'user' }
    ];
    const body = await mount(fakeApi({ list: async () => rows }));
    expect(body.querySelectorAll('[data-market-card]').length).toBe(2);
    expect(body.querySelector('[data-market-card="my-own"]')).toBeNull();
    expect(body.querySelector('[data-market-card="chop-and-drop"] [data-market-install]')?.textContent).toBe('Added ✓');
  });

  test('search filters the cards after the debounce and shows an empty state', async () => {
    vi.useFakeTimers();
    try {
      const rows = [t('chop-and-drop', 'Chop and drop', ['skilling'], 10), t('mine-and-drop', 'Mine and drop', ['mining'], 20)];
      const c = ctx();
      const view = createMarketplaceView(c, { api: () => fakeApi({ list: async () => rows }), hasSession: () => true, openPanel: c.openPanel });
      const body = document.createElement('div');
      view.mount(body);
      await vi.advanceTimersByTimeAsync(0);
      const search = body.querySelector<HTMLInputElement>('[data-market-search]')!;
      // The mock's 29px search box, which is the `lg` size of the same component.
      expect(search.className).toBe('input input-lg');
      search.value = 'mining';
      search.dispatchEvent(new Event('input'));
      expect(body.querySelectorAll('[data-market-card]').length).toBe(2);
      await vi.advanceTimersByTimeAsync(200);
      expect(body.querySelectorAll('[data-market-card]').length).toBe(1);
      search.value = 'nothing at all';
      search.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(200);
      expect(body.querySelectorAll('[data-market-card]').length).toBe(0);
      expect(body.textContent).toContain('No scripts match.');
    } finally {
      vi.useRealTimers();
    }
  });

  test('start here is badged only for tutorial island inside a tutorial region', async () => {
    const rows = [t('tutorial-island', 'Tutorial Island', ['starter'], 0), t('chop-and-drop', 'Chop and drop', [], 10)];
    const inside = { regionId: TUTORIAL_REGION_IDS[0] } as WorldState;
    const on = await mount(fakeApi({ list: async () => rows, getState: () => inside }));
    expect(on.querySelector('[data-market-card="tutorial-island"]')?.textContent).toContain('Start here');
    expect(on.querySelector('[data-market-card="chop-and-drop"]')?.textContent).not.toContain('Start here');
    const off = await mount(fakeApi({ list: async () => rows, getState: () => ({ regionId: 12_850 }) as WorldState }));
    expect(off.querySelector('[data-market-card="tutorial-island"]')?.textContent).not.toContain('Start here');
  });

  test('run now calls api.run and surfaces a busy refusal through notify', async () => {
    const c = ctx();
    const run = vi.fn(async () => { throw new Error('a run is already active; stop it first'); });
    const body = await mount(fakeApi({ list: async () => [t('chop-and-drop', 'Chop and drop')], run: run as unknown as TasksApi['run'] }), c);
    body.querySelector<HTMLButtonElement>('[data-market-run]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledWith('chop-and-drop');
    expect(c.notify).toHaveBeenCalledWith('a run is already active; stop it first', 'error');
  });

  test('a script with params says the run used its defaults; one without does not', async () => {
    const withParams = ctx();
    const params = { drop: { type: 'boolean' as const, label: 'Drop logs', default: true } };
    await (async () => {
      const body = await mount(fakeApi({ list: async () => [{ ...t('chop-and-drop', 'Chop and drop'), params }] }), withParams);
      body.querySelector<HTMLButtonElement>('[data-market-run]')!.click();
      await Promise.resolve();
      await Promise.resolve();
    })();
    expect(withParams.notify).toHaveBeenCalledWith('Started Chop and drop with its default settings.');

    const noParams = ctx();
    const body = await mount(fakeApi({ list: async () => [t('tutorial-island', 'Tutorial Island')] }), noParams);
    body.querySelector<HTMLButtonElement>('[data-market-run]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(noParams.notify).toHaveBeenCalledWith('Started Tutorial Island.');
  });

  test('add to my tasks installs and re-renders the row as added', async () => {
    let installed = false;
    const install = vi.fn(async () => { installed = true; return { id: 'chop-and-drop' }; });
    const api = fakeApi({
      list: async () => [{ ...t('chop-and-drop', 'Chop and drop'), installed }],
      install: install as unknown as TasksApi['install']
    });
    const body = await mount(api);
    expect(body.querySelector('[data-market-install]')?.textContent).toBe('Add to my tasks');
    body.querySelector<HTMLButtonElement>('[data-market-install]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(install).toHaveBeenCalledWith('chop-and-drop');
    expect(body.querySelector('[data-market-install]')?.textContent).toBe('Added ✓');
  });

  // Mounted outside the Automation panel there is no tab to move, so the fallback still opens it.
  test('a turned-off script says so and its button opens My tasks instead of running', async () => {
    const c = ctx();
    const api = fakeApi({ list: async () => [{ ...t('chop-and-drop', 'Chop and drop'), enabled: false }] });
    const body = await mount(api, c);
    const card = body.querySelector('[data-market-card="chop-and-drop"]')!;
    expect(card.textContent).toContain('Turned off');
    expect(card.textContent).toContain('Turn it back on under My tasks');
    const btn = card.querySelector<HTMLButtonElement>('[data-market-run]')!;
    expect(btn.textContent).toBe('Open My tasks');
    btn.click();
    await Promise.resolve();
    expect(api.run).not.toHaveBeenCalled();
    expect(c.openPanel).toHaveBeenCalledWith('tasks');
  });

  // Inside Automation the player is already in the panel `openPanel('tasks')` would open, so the
  // seam moves the TAB and the panel is left alone.
  test('inside the Automation panel the same button moves the tab and opens no panel', async () => {
    const c = ctx();
    const showMyTasks = vi.fn();
    const api = fakeApi({ list: async () => [{ ...t('chop-and-drop', 'Chop and drop'), enabled: false }] });
    const body = await mount(api, c, showMyTasks);
    body.querySelector<HTMLButtonElement>('[data-market-run]')!.click();
    await Promise.resolve();
    expect(showMyTasks).toHaveBeenCalled();
    expect(c.openPanel).not.toHaveBeenCalled();
  });

  test('an enabled script keeps Run now and carries no turned-off notice', async () => {
    const c = ctx();
    const api = fakeApi({ list: async () => [t('chop-and-drop', 'Chop and drop')] });
    const body = await mount(api, c);
    const card = body.querySelector('[data-market-card="chop-and-drop"]')!;
    expect(card.textContent).not.toContain('Turned off');
    const btn = card.querySelector<HTMLButtonElement>('[data-market-run]')!;
    expect(btn.textContent).toBe('Run now');
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.run).toHaveBeenCalledWith('chop-and-drop');
  });

  // Starting a run has to LAND on the run, and the run card is at the top of My tasks. Inside the
  // Automation panel `openPanel('tasks')` re-opens the panel the player is standing in, which
  // re-mounts this view with the Marketplace tab still in front: the run is nowhere on screen.
  // It takes the same seam the turned-off button takes.
  test('starting a run from inside the Automation panel moves the tab, not the panel', async () => {
    const c = ctx();
    const showMyTasks = vi.fn();
    const api = fakeApi({ list: async () => [t('chop-and-drop', 'Chop and drop')] });
    const body = await mount(api, c, showMyTasks);
    body.querySelector<HTMLButtonElement>('[data-market-run]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.run).toHaveBeenCalledWith('chop-and-drop');
    expect(showMyTasks).toHaveBeenCalled();
    expect(c.openPanel).not.toHaveBeenCalled();
  });

  // Mounted anywhere else there is no tab to move, so the panel is still the only answer.
  test('starting a run with no tab to move falls back to opening the Automation panel', async () => {
    const c = ctx();
    const api = fakeApi({ list: async () => [t('chop-and-drop', 'Chop and drop')] });
    const body = await mount(api, c);
    body.querySelector<HTMLButtonElement>('[data-market-run]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.openPanel).toHaveBeenCalledWith('tasks');
  });

  test('with no api yet the panel says to start a character first', async () => {
    const body = await mount(null);
    expect(body.textContent).toContain('Start a character');
  });
});
