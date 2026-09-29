import { expect, test, type Page } from '@playwright/test';
import { CARD_FAMILIES } from '../src/styles/families';

// Library part 2's other half (plan ruling R26). The five `components/**/*.card.html` demo cards
// cannot render -- each one loads `../../_ds_bundle.js`, which the vendored bundle does not carry,
// plus React and Babel from unpkg -- so the baselines are taken of OUR rendering of the same
// system, which is the only rendering that exists. `styleguide.families.test.ts` is the checklist
// that says every one of the bundle's nineteen components is on this page; these eight PNGs are
// what says a token change did not move one of them.
//
// One family spans several sections: core.card.html exercises Button, Badge, Tag, StatusDot,
// Alert, SectionLabel and Icon, and this plan deliberately splits those across four sections.
// Mapping `core` to `#buttons` alone would let a token change that moved a badge height or an
// alert rail pass the baseline it was written to catch. One named snapshot per section also
// keeps each PNG small enough to review by eye at Step 3.
const SECTIONS: Record<(typeof CARD_FAMILIES)[number], readonly string[]> = {
  core: ['#buttons', '#badges', '#alerts', '#icons'],
  data: ['#data'], forms: ['#forms'], navigation: ['#navigation'], overlay: ['#overlay']
};

/** The styleguide is served at `/styleguide` and nowhere else (`server/src/router.ts`'s `classify`). */
async function openStyleguide(page: Page): Promise<void> {
  await page.goto('/styleguide');
  await expect(page.locator('#buttons')).toBeVisible();
}

test.describe('component library baselines', () => {
  for (const family of CARD_FAMILIES) {
    for (const id of SECTIONS[family]) {
      test(`${family} family matches its baseline at ${id}`, async ({ page }) => {
        await openStyleguide(page);
        // Fonts and the infinite animations are the only sources of flake here. `.then(() =>
        // undefined)` matters: document.fonts.ready resolves with a FontFaceSet, and Playwright
        // serialises what an evaluate resolves to, so returning it directly throws -- in the one
        // guard written to remove flake.
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        // Disabling animation is not cosmetic: `shimmer`, `barflow`, `pulse`, `bob` and
        // `stepPulse` are all `infinite`, and a baseline taken mid-shimmer never matches twice.
        // A token change that alters a button's height still fails the test, which is the point.
        await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
        // The tolerance, and it is the whole difference between a baseline and a decoration.
        // The plan asked for `maxDiffPixelRatio: 0.01`; against sections roughly a million pixels
        // each that allows ten thousand changed pixels, and a review measured what that lets
        // through: `padding: 0 13px` to `0 17px` on `.btn` (a 31 percent horizontal growth on
        // every button in the shell) diffs 3,929 pixels at #buttons and passed, and `.menu-item`
        // 8px to 20px passed at #overlay. Task 21's fix round replaced it with an absolute cap,
        // measured rather than guessed: with these baselines the render is bit-identical, zero
        // differing pixels over three consecutive runs, so 100 is pure headroom for a font
        // hinting nudge and still one fortieth of the smallest regression anyone has measured
        // here. A ratio cannot do this job: it scales the allowance WITH the section, so the
        // tallest sections get the loosest guard, which is backwards.
        await expect(page.locator(id)).toHaveScreenshot(`${family}-${id.slice(1)}.png`, { maxDiffPixels: 100 });
      });
    }
  }
});
