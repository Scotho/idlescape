// web/src/frame/teardown.test.ts -- audit C18's rule, mechanised: every interval this shell arms
// has a handle, and every handle is released in main.ts's `pagehide` teardown.
//
// It is a SOURCE test on purpose. `main.ts` `byId()`s at module scope, which audit C18 ruled makes
// it unimportable under jsdom, so the wiring it does can only be read, never run. Entry 4's review
// found the cost of having no rule here at all: the co-pilot bar's 1 Hz tick and its document
// keydown, and the stage's 1 Hz tab clock, were both armed by this entry and neither was on the
// teardown list, in the block audit C18 wrote for exactly this. The list is page-lifetime, so a
// miss leaks nothing while the page lives; it leaks per reload, which is the shape of leak nobody
// notices until a session has been open all day.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, '../main.ts'), 'utf8');

/** The body of the one `teardown: () => { ... }` main.ts hands `createPageHideHandler`. */
function teardownBody(): string {
  const m = /teardown:\s*\(\)\s*=>\s*\{([^}]*)\}/.exec(main);
  expect(m, 'main.ts has no pagehide teardown').not.toBeNull();
  return m?.[1] ?? '';
}

describe("the pagehide teardown releases every interval the frame arms", () => {
  // Mechanical, so a module that starts arming an interval tomorrow is on the list tomorrow rather
  // than at the next review. Mutation targets: dropping `copilotBar.dispose()` or `stage.dispose()`
  // from the teardown fails here, and so does giving any other frame/ module a `setInterval`
  // without releasing whatever main.ts named it.
  it('names the disposer of every frame module that arms one', () => {
    const body = teardownBody();
    const missing: string[] = [];
    const armed: string[] = [];
    for (const file of readdirSync(here).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const src = readFileSync(join(here, file), 'utf8');
      if (!src.includes('setInterval(')) continue;
      const factory = /export function (create[A-Za-z]\w*)/.exec(src)?.[1];
      if (factory === undefined) continue;
      // Only the modules main.ts itself constructs: one whose factory the page never calls has no
      // handle for the page to release, and inventing a name for it would be a false failure.
      const held = new RegExp(`const (\\w+) = ${factory}\\(`).exec(main)?.[1];
      if (held === undefined) continue;
      armed.push(`${file} -> ${held}`);
      if (!body.includes(`${held}.dispose()`)) missing.push(`${file}: ${held}.dispose() is not in the teardown`);
    }
    // A scan that found nothing would pass silently, which is the failure mode this whole file is
    // about. Three modules arm an interval today (the co-pilot bar, the stage and the pinned card),
    // and a fourth is welcome: the floor is what makes an empty scan a failure, not the exact count.
    expect(armed.length, 'no frame module was scanned; the rule found nothing to check').toBeGreaterThanOrEqual(3);
    expect(missing).toEqual([]);
  });

  // The four handles that are not a frame module, so the case above cannot see them: the fps timer
  // main.ts holds itself, the health watcher, the singletons and the window manager. Literal, and
  // it is the list entry 4's review read the block against.
  it('keeps the four handles that are not frame modules', () => {
    const body = teardownBody();
    for (const call of ['clearInterval(fpsTimer)', 'healthWatcher.stop()', 'singletons.dispose()', 'windows.dispose()']) {
      expect(body, call).toContain(call);
    }
  });
});
