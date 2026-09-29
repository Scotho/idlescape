import { expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';
import type { ClientState } from '../src/clientTypes';

// Shared Playwright helpers for the idlescape stack (front server 8787, engine 8899,
// firebase emulators). Everything here goes through the human path: the home screen, then one of
// its own choices ("Play as guest", "Create account"). Nothing pairs a Claude
// session.

/** Password every spec signs up with; the delete dialog re-authenticates with it. */
export const SIGNUP_PASSWORD = 'secret123';

/** Native canvas size the 274 client draws into (frame.html); mouse maths use this space. */
export const CANVAS = { width: 789, height: 532 } as const;
/** Minimap sprite: drawn at (575, 8), 146x151 (Client.minimapLoop); centre is the player. */
export const MINIMAP_CENTRE = { x: 648, y: 83 } as const;
/** 3D viewport: (4, 4) 512x334; the player stands near the centre. */
export const VIEWPORT_CENTRE = { x: 260, y: 171 } as const;

/**
 * One token per test process. `gameNames/{name}` is a permanent reservation -- `softDelete`
 * never releases it -- so a spec that hard-codes character names only passes the first time it
 * runs against a given emulator dataset. Every name a spec creates goes through here.
 */
const RUN_TOKEN = Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');

/** A run-unique game name: `prefix` + the run token, clipped to the server's 12-char limit. */
export function uniqueName(prefix: string): string {
  return `${prefix}${RUN_TOKEN}`.slice(0, 12);
}

/** Loads the site and waits for the home screen, the first thing every visitor sees. */
export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#screen-home')).toBeVisible();
}

export function clientState(page: Page): Promise<ClientState> {
  return page.evaluate(() => window.idlescape!.client!.getState());
}

/**
 * Guest characters are named by the player now, so every default name must still be unique: the
 * run token alone repeats within a worker, and `gameNames/{name}` is a permanent reservation.
 */
let guestSeq = 0;

/** Fills the pre-game naming form and waits for the frame. Guests and registered users alike. */
export async function createFirstCharacter(page: Page, name: string): Promise<void> {
  await expect(page.locator('#screen-characters')).toBeVisible({ timeout: 30_000 });
  await page.locator('#char-name').fill(name);
  await page.locator('#btn-char-create').click();
  await expect(page.locator('#screen-frame')).toBeVisible({ timeout: 30_000 });
}

/**
 * Presses "Play as guest", names the character (guests choose a name now, SP7 owner requirement 1)
 * and waits until the client reports a logged-in player with stats and a world position. The gate
 * auto-presses Login for a character the player just created. Returns the game name.
 */
export async function loginAsGuest(page: Page, name: string = uniqueName(`g${++guestSeq}_`)): Promise<string> {
  await expect.poll(() => page.locator('#btn-guest').isEnabled(), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('#entry-connect-view')).toBeHidden();
  await page.locator('#btn-guest').click();
  await createFirstCharacter(page, name);
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().skills.xp.length ?? 0), { timeout: 30_000 }).toBeGreaterThan(20);
  // position becomes non-zero once the first player-update packet has placed the local player.
  await expect.poll(async () => (await clientState(page)).position.x, { timeout: 60_000 }).toBeGreaterThan(0);
  // The world is only playable by a human once the region scene is built (loading bar gone).
  await expect.poll(async () => (await clientState(page)).sceneReady, { timeout: 120_000 }).toBe(true);
  const state = await clientState(page);
  if (!state.gameName) throw new Error('logged in without a game name');
  return state.gameName;
}

/**
 * Clicks a character's tab and waits for that character's session to be the visible one and back
 * in game. For switching to a session that is ALREADY logged in: a tab sitting at its own title
 * screen needs `pressTitleLogin`, and the caller should wait for that itself.
 *
 * The wait is on the session's own `loggedIn` and `hidden`, not on the facade's `gameName`:
 * `getState().gameName` is the client's `loginUser`, which is set when a login is ARMED rather
 * than when it succeeds, so polling it and then asserting the switch is finished is a race (the
 * one that used to lose about one run in three in characters.pw.test.ts).
 */
export async function openCharacterTab(page: Page, characterName: string): Promise<void> {
  const tab = page.locator(`#character-tabs [data-char-tab]:has-text("${characterName}")`);
  await expect(tab).toBeVisible();
  await tab.click();
  await expect
    .poll(async () => (await sessionStates(page)).some(s => s.gameName === characterName && s.loggedIn && !s.hidden), { timeout: 30_000 })
    .toBe(true);
}

/** Every open session, read straight out of its iframe: which are online, which are hidden. */
export function sessionStates(page: Page): Promise<{ character: string; gameName: string | null; loggedIn: boolean; hidden: boolean }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLIFrameElement>('#client-frames iframe')).map(f => {
      const w = f.contentWindow as (Window & { idlescape?: { client?: { getState(): { gameName: string | null; loggedIn: boolean } } | null } }) | null;
      const s = w?.idlescape?.client?.getState();
      return { character: f.dataset.character ?? '', gameName: s?.gameName ?? null, loggedIn: s?.loggedIn ?? false, hidden: f.classList.contains('hidden') };
    })
  );
}

/**
 * Registers a brand-new email account from the home screen and returns the email used. The
 * caller lands on the characters gate: a registered account with no character must name one.
 */
export async function signUp(page: Page, name: string): Promise<string> {
  const email = `${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await expect.poll(() => page.locator('#btn-show-signup').isEnabled(), { timeout: 30_000 }).toBe(true);
  await page.locator('#btn-show-signup').click();
  await expect(page.locator('#signup-form')).toBeVisible();
  await page.locator('#signup-name').fill(name);
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(SIGNUP_PASSWORD);
  await page.locator('#signup-form button[type="submit"]').click();
  return email;
}

/**
 * Opens a panel by its strip icon *without* toggling it shut. The strip click handler toggles,
 * and `startSession` restores the last open panel after a character switch, so a blind click
 * on an already-open panel would close it.
 */
export async function openPanel(page: Page, id: string): Promise<void> {
  const icon = page.locator(`[data-panel="${id}"]`);
  await expect(icon).toBeVisible();
  if (!(await icon.evaluate(el => el.classList.contains('active')))) await icon.click();
  await expect(page.locator('#side-panel')).toBeVisible();
}

/**
 * Records hook events on window.__e2e so steps can assert on what the client saw. `window.idlescape.client`
 * is the parent's façade over the *active* session, so a recorder installed here silently follows
 * only the character whose tab was in front when it was installed.
 */
export async function installRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rec = { chat: [] as { kind: string; sender: string | null; text: string }[], events: [] as string[] };
    window.__e2e = rec;
    const c = window.idlescape!.client!;
    c.on('chat', e => { rec.chat.push(e); });
    c.on('logout', () => { rec.events.push('logout'); });
    c.on('disconnect', () => { rec.events.push('disconnect'); });
    c.on('inventory', () => { rec.events.push('inventory'); });
    c.on('xp', () => { rec.events.push('xp'); });
  });
}

/**
 * The active character's canvas now lives inside a same-origin `/play.html` iframe, so every
 * canvas measurement goes through `#client-frames iframe:not(.hidden)`. The canvas fills the
 * iframe, so the iframe's own bounding box is the canvas's box in page coordinates.
 */
async function activeCanvasBox(page: Page): Promise<{ left: number; top: number; width: number; height: number }> {
  const box = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('#client-frames iframe:not(.hidden)');
    if (!frame) throw new Error('no active client frame');
    const r = frame.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  return box;
}

/**
 * In `auto` size mode the canvas is as wide as the stage allows and as tall as its own 789x532
 * aspect then makes it, so at the 1280x800 Playwright viewport it is about 1208x815 and the page
 * scrolls. The chrome above it decides how much of the canvas is below the fold: the shell v2
 * title bar and character tab bar are 11px taller than their pre-v2 selves, which pushed the chat
 * pane's own row from y=792 to y=803 and out of the viewport, and `page.mouse.click` outside the
 * viewport is a SILENT no-op -- the canvas never took focus, so the keys the caller typed next
 * went nowhere. Scroll the target into view first, then re-read the box, so a click is aimed at
 * the point the caller asked for however tall the chrome above the stage grows.
 */
async function scrollCanvasPointIntoView(page: Page, y: number): Promise<void> {
  await page.evaluate(
    ({ nativeY, nativeH }) => {
      const frame = document.querySelector<HTMLIFrameElement>('#client-frames iframe:not(.hidden)');
      if (!frame) throw new Error('no active client frame');
      const r = frame.getBoundingClientRect();
      const py = r.top + (nativeY * r.height) / nativeH;
      // A margin, not zero: the mouse lands on a point and not on an edge, and a click one pixel
      // inside the viewport still reads as the row above on a scaled canvas.
      const margin = 12;
      if (py > window.innerHeight - margin) window.scrollBy(0, Math.ceil(py - (window.innerHeight - margin)));
      else if (py < margin) window.scrollBy(0, Math.floor(py - margin));
    },
    { nativeY: y, nativeH: CANVAS.height }
  );
}

/** Clicks a point given in native canvas pixels, scaling through the CSS-sized iframe. */
export async function canvasClick(page: Page, x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
  await scrollCanvasPointIntoView(page, y);
  const box = await activeCanvasBox(page);
  const px = box.left + (x * box.width) / CANVAS.width;
  const py = box.top + (y * box.height) / CANVAS.height;
  const viewport = page.viewportSize();
  // Loud rather than silent: a click Playwright drops off the edge of the viewport used to look
  // exactly like a click the client ignored, which is a whole bisect's worth of difference.
  if (viewport && (py < 0 || py > viewport.height || px < 0 || px > viewport.width)) {
    throw new Error(`canvas point (${x}, ${y}) maps to (${Math.round(px)}, ${Math.round(py)}), outside the ${viewport.width}x${viewport.height} viewport`);
  }
  await page.mouse.click(px, py, { button });
}

/**
 * Samples canvas pixels in native coordinates as "r,g,b" strings. Used to prove the world is
 * actually painted: the pre-login loading bar leaves a solid red (140,17,17) at (300,250) and a
 * blank minimap at (648,83); a rendered scene shows neither.
 */
export function canvasPixels(page: Page, points: { x: number; y: number }[]): Promise<string[]> {
  return page.evaluate(pts => {
    const frame = document.querySelector<HTMLIFrameElement>('#client-frames iframe:not(.hidden)');
    const c = frame?.contentDocument?.getElementById('canvas') as HTMLCanvasElement | null;
    if (!c) throw new Error('no active client canvas');
    const ctx = c.getContext('2d')!;
    return pts.map(p => Array.from(ctx.getImageData(p.x, p.y, 1, 1).data.slice(0, 3)).join(','));
  }, points);
}

/**
 * The single centred title button `drawArmedLoginButton()` paints (client patch 24). Its hit test
 * (patch 25) is `x = (sWid / 2) | 0`, `y = ((sHei / 2) | 0) + 40` with a 150x40 box, so the centre
 * of a 789x532 canvas button is (394, 306).
 */
export const TITLE_LOGIN_BUTTON = { x: Math.trunc(CANVAS.width / 2), y: Math.trunc(CANVAS.height / 2) + 40 } as const;

export async function pressTitleLogin(page: Page): Promise<void> {
  await canvasClick(page, TITLE_LOGIN_BUTTON.x, TITLE_LOGIN_BUTTON.y);
}

export const LOADING_BAR_RED = '140,17,17';

/** Polls the player's tile until it differs from `from`; resolves false on timeout. */
export async function waitForMove(page: Page, from: { x: number; z: number }, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const p = (await clientState(page)).position;
    if (p.x !== from.x || p.z !== from.z) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/**
 * Creates a character from the in-game Account panel, which is where the character list lives
 * since the Characters panel merged into it (G5), and waits for its row to appear. The panel is
 * opened with `openPanel` rather than a bare strip click: the strip toggles, and the panel is
 * often already on screen (a character switch restores the last open one).
 */
export async function createCharacterFromPanel(page: Page, name: string): Promise<void> {
  await openPanel(page, 'account');
  await page.locator('#char-panel-name').fill(name);
  await page.locator('#char-panel-create button[type="submit"]').click();
  await expect(page.locator(`[data-char-row]:has-text("${name}")`)).toBeVisible({ timeout: 15_000 });
}

// --- The bank (SP8 and SP8b) ---------------------------------------------------------------
// The management port is loopback-only and never reachable from the browser; the test process
// talks to it directly to seed items, standing in for the Contracts service that will do it for
// real in SP9. Everything the *browser* does goes through the front server.

export const MANAGEMENT = process.env.E2E_ENGINE_MANAGEMENT ?? 'http://127.0.0.1:8897';
// The management routes verify ENGINE_MANAGEMENT_SECRET, not the owner-assertion secret: the
// two are deliberately different values (engine-custom/PATCHES.md, "Management routes").
export const MANAGEMENT_SECRET = process.env.ENGINE_MANAGEMENT_SECRET ?? '';
const AUTH_EMULATOR = process.env.E2E_AUTH_EMULATOR ?? 'http://127.0.0.1:9099';
const API_KEY = process.env.E2E_FIREBASE_API_KEY ?? 'placeholder-api-key';

export interface BankSnapshot {
  ownerKey: string;
  version: number;
  capacity: number;
  tabs: number[];
  slots: { slot: number; obj: number; count: number }[];
}

/** An API context already carrying the management secret. Loopback only; never the browser. */
export async function managementContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ extraHTTPHeaders: { 'x-idlescape-mgmt': MANAGEMENT_SECRET } });
}

/**
 * A Firebase ID token for the account the browser just signed up as. `/api/bank` is a human
 * route and the front server authenticates it from an `Authorization: Bearer` header only (no
 * cookie the browser carries is an identity), so the spec needs a real token in hand.
 * It signs in again through the auth emulator's REST API rather than digging the SDK's token
 * out of IndexedDB: same uid, same account, and no dependency on how the Firebase JS SDK
 * happens to persist its session.
 */
export async function idTokenFor(email: string): Promise<string> {
  const api = await playwrightRequest.newContext();
  try {
    const res = await api.post(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      data: { email, password: SIGNUP_PASSWORD, returnSecureToken: true }
    });
    expect(res.status(), `auth emulator refused the sign-in for ${email}`).toBe(200);
    const body = (await res.json()) as { idToken?: string };
    expect(body.idToken, 'auth emulator returned no idToken').toBeTruthy();
    return body.idToken!;
  } finally {
    await api.dispose();
  }
}

export async function readBank(page: Page, idToken: string): Promise<BankSnapshot> {
  const res = await page.request.get('/api/bank', { headers: { authorization: `Bearer ${idToken}` } });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as BankSnapshot;
}

/** Registers an account, names its first character and waits for it to be in game. */
export async function signUpAndPlay(page: Page, accountName: string, character: string): Promise<string> {
  await openHome(page);
  const email = await signUp(page, accountName);
  await expect(page.locator('#screen-characters')).toBeVisible({ timeout: 30_000 });
  await page.locator('#char-name').fill(character);
  await page.locator('#btn-char-create').click();
  await expect(page.locator('#screen-frame')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);
  return email;
}

/** Opens the Bank panel from the strip and waits for the window. */
export async function openBankWindow(page: Page): Promise<void> {
  await openPanel(page, 'bank');
  await expect(page.locator('#bank-window')).toBeVisible({ timeout: 15_000 });
  // The first paint can precede the first snapshot; wait for a real capacity reading.
  await expect.poll(async () => (await page.locator('#bank-capacity').textContent()) ?? '', { timeout: 20_000 }).toMatch(/^\d+ \/ 240$/);
  // The v2 window arrives on the family's `popIn` (.18s, shell v2 Task 7), which the SP8b bank
  // never had. `toBeVisible` does not wait for an animation, so a rect read the instant the
  // window appears is a rect mid-flight: scaled, offset, and in the edge-clamp spec's case
  // partly outside the viewport, where a mouse click is a silent no-op. Nothing in the bank
  // measures itself, so this belongs to whoever measures it: every caller here does.
  await page.locator('#bank-window').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
}

/** The obj id in each rendered slot, in visual order; null for an empty slot. */
export function bankObjOrder(page: Page): Promise<(number | null)[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#bank-window [data-bank-slot]'))
      .map(cell => (cell.dataset.bankObj ? Number(cell.dataset.bankObj) : null))
  );
}

/**
 * Presses, drags past the threshold in steps, and releases over the target. The intermediate
 * `mouse.move` is not decoration: a `hover()` straight onto the target lands the pointer on its
 * centre and the browser then coalesces the second `hover()` to the same coordinates into
 * nothing, so the pane would see one move and no is-target repaint before the release.
 */
export async function dragBankSlot(page: Page, from: number, to: number): Promise<void> {
  const source = page.locator(`#bank-window [data-bank-slot="${from}"]`);
  const target = page.locator(`#bank-window [data-bank-slot="${to}"]`);
  const box = await target.boundingBox();
  if (!box) throw new Error(`bank slot ${to} has no box`);
  await source.hover();
  await page.mouse.down();
  // Steps matter: the input layer only becomes a drag past 4 px of travel.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 1);
  await page.mouse.up();
}

/**
 * Reads a scoped store key from the page without knowing the signed-in uid: audit C10 moved
 * `cs.plugin.<id>` to `cs.plugin.u.<uid>.<id>` (see web/src/storage/scoped.ts). Returns the first
 * signed-in bucket's value for that id, or null.
 */
export async function scopedItem(page: Page, ns: 'plugin' | 'script', id: string): Promise<string | null> {
  return page.evaluate(([namespace, key]) => {
    const prefix = `cs.${namespace}.u.`;
    const suffix = `.${key}`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null && k.startsWith(prefix) && k.endsWith(suffix)) return localStorage.getItem(k);
    }
    return null;
  }, [ns, id] as const);
}
