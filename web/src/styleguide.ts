// web/src/styleguide.ts -- interactive demos for the styleguide page. Not part of the app bundle.
import { BANK_FOOTER_NOTE, EVENTS_EMPTY_COPY, LOOT_EMPTY_COPY, bankUpdated, runFailed, tracePoppedOut } from './ui/copy';
import { confirmDialog } from './ui/dialog';
import { h } from './ui/el';
import { ICON_NAMES, icon } from './ui/icon';
import { createCopilotBar } from './frame/copilotBar';
import { renderRunCard, renderScriptRow, updateRunCard } from './plugins/builtin/tasksViews';
import { renderHistoryRow } from './plugins/builtin/tasksHistory';
import { renderMarketCard } from './plugins/builtin/marketplace';
import { applyTabListA11y } from './ui/strip';
import { createToastHost, type ToastTone } from './ui/toast';
import type { PairingState } from './frame/pairing';
import type { RunStatus, RunSummary, TaskSummary } from './tasks/types';

const toastRoot = document.getElementById('sg-toasts');
const toasts = toastRoot ? createToastHost(toastRoot) : null;
const MESSAGES: Record<ToastTone, string> = {
  neutral: 'Session reset',
  ok: 'Revoked "MacBook".',
  error: "Couldn't create a link.",
  info: 'World 1 restarts in 10 minutes.'
};

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-sg-toast]'))) {
  btn.addEventListener('click', () => {
    const tone = (btn.dataset.sgToast ?? 'neutral') as ToastTone;
    toasts?.show(MESSAGES[tone], tone);
  });
}

const result = document.querySelector<HTMLElement>('[data-sg-dialog-result]');
document.querySelector<HTMLButtonElement>('[data-sg-dialog]')?.addEventListener('click', () => {
  void confirmDialog({
    title: 'Revoke "MacBook"?',
    body: 'That Claude session loses access to this account right away. You can pair it again later.',
    confirmLabel: 'Revoke',
    danger: true
  }).then(ok => { if (result) result.textContent = ok ? 'Revoked.' : 'Kept.'; });
});

// The icon grid is generated from ICON_NAMES rather than written out as eleven `<svg>` blocks, so
// a twelfth glyph appears on this page the moment web/src/ui/icon.ts declares one, and no path
// data is ever copied out of that module into this one.
const iconHost = document.querySelector<HTMLElement>('[data-sg-icons]');
if (iconHost) {
  iconHost.replaceChildren(...ICON_NAMES.map(name => h('span', { class: 'sg-icon' }, icon(name), h('small', {}, name))));
}
const sizeHost = document.querySelector<HTMLElement>('[data-sg-icon-sizes]');
if (sizeHost) {
  sizeHost.replaceChildren(...[16, 20, 28].map(size => h('span', { class: 'sg-icon' }, icon('bank', size), h('small', {}, `${size}px`))));
}

// Every other demo glyph on the page: `data-sg-icon` names one, and the real builder draws it.
// `prepend`, not `replaceChildren`: the Automation strip button already holds its run dot.
// `data-sg-icon-size` is for the demos whose panel draws the glyph at something other than 16:
// the Plugins settings gear is `iconHtml('config', 14)`, and a baseline at the wrong size is a
// baseline that cannot catch the panel changing.
for (const host of Array.from(document.querySelectorAll<HTMLElement>('[data-sg-icon]'))) {
  const size = host.dataset.sgIconSize;
  host.prepend(icon(host.dataset.sgIcon ?? '', size === undefined ? undefined : Number(size)));
}

// The demo strip behaves like the real one: click to select, arrow keys to move.
const strip = document.querySelector<HTMLElement>('[data-sg-strip]');
if (strip) {
  const a11y = applyTabListA11y(strip);
  strip.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-panel]');
    if (!btn) return;
    for (const tab of Array.from(strip.querySelectorAll('[data-panel]'))) tab.classList.toggle('active', tab === btn);
    a11y.syncSelected();
  });
}

// The demo bank tab bar behaves like tabsBar.ts: selection is aria-selected, not an "active"
// class (tabsBar.ts never sets one), and only one real tab stays in the Tab order at a time.
const bankTabs = document.querySelector<HTMLElement>('[data-sg-bank-tabs]');
if (bankTabs) {
  bankTabs.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-bank-tab]');
    if (!btn) return;
    for (const tab of Array.from(bankTabs.querySelectorAll<HTMLElement>('[data-bank-tab]'))) {
      const selected = tab === btn;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
    }
  });
}

// The co-pilot bar in all five presented states, drawn by the real renderer rather than by markup
// copied out of it, so this page cannot drift from what the frame ships. There is no api behind
// them, which is why no demo shows a position: `RunStatus` carries none and the bar asks the api
// for it. The clock is frozen so the page screenshots the same way twice.
const FROZEN = 1_700_000_000_000;
const RUN: RunStatus = {
  state: 'running', reason: null, runId: 'sg', scriptId: 'chop-and-drop', scriptName: 'Chop and drop',
  task: 'Chop tree', statusLine: 'chopping the nearest tree · 41 logs', attempts: 1, startedAt: FROZEN - 125_000,
  attached: false, resumeAtMs: null, target: null, health: null, xpPerHour: {}
};
const COPILOT: Record<string, { status: Partial<RunStatus>; pairing: PairingState }> = {
  unpaired: { status: { state: 'idle' }, pairing: 'unpaired' },
  standby: { status: { state: 'idle' }, pairing: 'paired-live' },
  // The running demo carries the detail row, the rate span and the health pip, because all three
  // ship and Task 21's completeness rule reads this section for every class copilot.css defines.
  running: {
    status: {
      target: { via: 'scene', kind: 'tree', name: 'Oak', distance: 12 },
      health: { condition: 'dialog-stuck', since: FROZEN - 20_000 },
      xpPerHour: { Woodcutting: 41_600 }
    },
    pairing: 'paired-live'
  },
  paused: { status: { state: 'paused', reason: 'human-input', statusLine: '', resumeAtMs: FROZEN + 5_000 }, pairing: 'paired-live' },
  stuck: { status: { state: 'paused', reason: 'stuck', statusLine: 'no Tree within 12 tiles' }, pairing: 'paired-live' }
};

for (const host of Array.from(document.querySelectorAll<HTMLElement>('[data-sg-copilot]'))) {
  const demo = COPILOT[host.dataset.sgCopilot ?? ''];
  const frame = host.parentElement;
  if (!demo || !frame) continue;
  // `strip` answers with the host itself: it holds no `[data-panel="tasks"]`, so the strip dot
  // finds nothing to paint and the demo stays self-contained.
  createCopilotBar({
    bar: host,
    detail: frame.querySelector<HTMLElement>('.copilot-detail')!,
    rule: frame.querySelector<HTMLElement>('.copilot-rule')!,
    strip: () => host, api: () => null, pairing: () => demo.pairing, session: () => 'online',
    openPanel: () => {}, openTrace: () => {}, notify: () => {}, now: () => FROZEN
  }).update({ ...RUN, ...demo.status });
}

// The Automation surfaces, drawn by the same builders the panel composes. Nothing here is markup
// copied out of a renderer: a class this page shows and the panel no longer emits would be a
// baseline that pins a surface nobody ships.
const SG_STEPS = [
  { label: 'Walk', state: 'done' as const },
  { label: 'Chop tree', state: 'current' as const },
  { label: 'Drop', state: 'upcoming' as const }
];
const SG_RUN: Record<string, Partial<RunStatus>> = {
  running: { xpPerHour: { Woodcutting: 41_600 }, target: { via: 'scene', kind: 'tree', name: 'Oak', distance: 12 } },
  paused: { state: 'paused', reason: 'human-input', statusLine: '', resumeAtMs: FROZEN + 5_000 },
  stuck: { state: 'paused', reason: 'stuck', statusLine: 'no Tree within 12 tiles' }
};

for (const host of Array.from(document.querySelectorAll<HTMLElement>('[data-sg-run]'))) {
  const over = SG_RUN[host.dataset.sgRun ?? ''];
  if (!over) continue;
  const status = { ...RUN, ...over };
  const cardEl = renderRunCard(status, {}, { now: FROZEN, steps: SG_STEPS });
  // The counters are the panel's to fill, so the demo fills them the same way the tick does,
  // with the mock's own two figures.
  updateRunCard(cardEl, status, { logs: 41, sessionXp: 4205 }, { now: FROZEN, steps: SG_STEPS });
  host.replaceChildren(cardEl);
}

const sgTask = (o: Partial<TaskSummary>): TaskSummary => ({
  id: 'chop-and-drop', name: 'Chop and drop', description: 'Chops the nearest tree, drops the logs, until target level.',
  version: 1, tags: ['skilling'], source: 'library', params: {}, requirements: { ok: true, missing: [] },
  order: 10, enabled: true, estimateMinutes: 20, ...o
});
const SG_SCRIPTS: TaskSummary[] = [
  sgTask({}),
  sgTask({
    id: 'mine-and-drop-fork', name: 'Mine and drop', description: 'My copy, tin filter removed.', source: 'fork',
    requirements: { ok: false, missing: ['Needs a bronze pickaxe in your inventory'] }
  }),
  sgTask({ id: 'net-fish', name: 'Net fish and drop', description: 'Nets the nearest spot.', source: 'user', enabled: false })
];

// All three into ONE `.task-list`, which is the container the panel really holds them in
// (builtin/tasks.ts's `scriptsHost`). Rendered into three hosts of its own, this page drew the
// right cards at the wrong rhythm and Task 21's baselines would have pinned the wrong gap.
document.querySelector<HTMLElement>('[data-sg-scripts]')
  ?.replaceChildren(...SG_SCRIPTS.map(task => renderScriptRow(task, {})));

const sgRun = (o: Partial<RunSummary>): RunSummary => ({
  runId: 'r1', scriptId: 'chop-and-drop', scriptName: 'Chop and drop', version: 1, source: 'library',
  startedBy: 'player', characterId: null, characterName: 'shoth4019zr', params: {}, status: 'done',
  startedAt: FROZEN - 1_122_000, endedAt: FROZEN, durationMs: 1_122_000, xpGained: { Woodcutting: 4180 },
  lastTask: 'drop', summary: '41 logs', itemsDelta: {}, tilesTravelled: 210, recoveries: {}, ...o
});

document.querySelector<HTMLElement>('[data-sg-history]')?.replaceChildren(
  renderHistoryRow(sgRun({}), () => {}),
  renderHistoryRow(sgRun({
    runId: 'r2', scriptId: 'net-fish', scriptName: 'Net fish and drop', status: 'failed', failReason: 'stuck',
    durationMs: 135_000, xpGained: {}, summary: 'no fishing spot in range'
  }), () => {})
);

document.querySelector<HTMLElement>('[data-sg-market]')?.replaceChildren(
  renderMarketCard(
    sgTask({ tags: ['skilling', 'woodcutting'], requirements: { ok: false, missing: ['Needs a bronze axe in your inventory or equipped'] } }),
    { installed: false, startHere: true },
    { run: () => {}, install: () => {}, openTasks: () => {} }
  ),
  renderMarketCard(
    sgTask({ id: 'net-fish', name: 'Net fish and drop', description: 'Nets the nearest fishing spot and drops the catch.', tags: ['skilling', 'fishing'], estimateMinutes: 25 }),
    { installed: true, startHere: false },
    { run: () => {}, install: () => {}, openTasks: () => {} }
  )
);

// The mock strings on this page that carry an em dash. Ruling R1 keeps every one of them in
// `ui/copy.ts` and nowhere else, so that reversing the ruling stays one file and one commit; the
// styleguide is a consumer like any panel, and it fills its own demo rows from the same constants
// the Events feed renders.
const SG_COPY: Record<string, string> = {
  lootEmpty: LOOT_EMPTY_COPY,
  eventsEmpty: EVENTS_EMPTY_COPY,
  bankUpdated: bankUpdated(27, 240),
  runFailed: runFailed('Mine and drop', 'needs a bronze pickaxe'),
  // The Windows demo is the shipped trace window, so its footer is the shipped footer: Task 21
  // photographs this page, and a hand-written near-miss here would pin the wrong words.
  tracePoppedOut: tracePoppedOut(312),
  // The same rule for the bank window's caption, in both places this page draws it: the Windows
  // demo above and the Bank section's own footer.
  bankFooterNote: BANK_FOOTER_NOTE
};

for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-sg-copy]'))) {
  const text = SG_COPY[el.dataset.sgCopy ?? ''];
  if (text) el.textContent = text;
}
