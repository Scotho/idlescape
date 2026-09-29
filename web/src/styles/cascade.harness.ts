// web/src/styles/cascade.harness.ts -- the shared setup behind every `cascade*.test.ts` file:
// load the real cascade into the document, then read a class list back.
//
// They all ask the same question of the same stylesheets and split only by subject, so the loader
// lives here rather than once per file; the set grows by one whenever a subject earns its own file,
// which is why this header counts none of them. It is a harness and not a test file on purpose:
// vitest collects `*.test.ts`, and a second copy of `beforeAll` is exactly the thing that drifts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const read = (rel: string): string => readFileSync(join(here, rel), 'utf8');

/** The real cascade: index.css's imports, in the order index.css declares them. */
export function importOrder(): string[] {
  return [...read('index.css').matchAll(/@import '\.\/([^']+)';/g)].map(m => m[1]);
}

/** Append every stylesheet to the document head, in the cascade's own order. */
export function loadCascade(): string[] {
  const files = importOrder();
  for (const file of files) {
    const style = document.createElement('style');
    style.textContent = read(file);
    document.head.appendChild(style);
  }
  return files;
}

/** Style one element with the whole layer and read back what applied. */
export function computed(tag: string, className: string): CSSStyleDeclaration {
  const el = document.createElement(tag);
  el.className = className;
  document.body.appendChild(el);
  return getComputedStyle(el);
}

/**
 * The declarations one selector writes, read out of the loaded cascade rather than off an element.
 * jsdom matches no `:hover`, so a rule that applies only under the pointer can be read nowhere
 * else; whether it LOOKS right once the pointer is there is a pixel claim, and those belong in a
 * Playwright spec.
 */
export function declarationsOf(selector: string): CSSStyleDeclaration {
  for (let s = 0; s < document.styleSheets.length; s += 1) {
    const rules = document.styleSheets[s].cssRules;
    for (let r = 0; r < rules.length; r += 1) {
      const rule = rules[r];
      if (rule instanceof CSSStyleRule && rule.selectorText === selector) return rule.style;
    }
  }
  throw new Error(`no rule in the cascade for ${selector}`);
}

/**
 * The same, for a rule that lives inside a media block. jsdom evaluates no media query, so a
 * breakpoint rule is reachable through neither of the readers above: `computed()` returns the
 * value the desktop rule wrote, and `declarationsOf` walks top-level rules only. Several files
 * open a block on the same condition, so this keeps looking past a block that does not carry the
 * selector rather than stopping at the first one whose condition matches.
 */
export function declarationsInMedia(condition: string, selector: string): CSSStyleDeclaration {
  for (let s = 0; s < document.styleSheets.length; s += 1) {
    const rules = document.styleSheets[s].cssRules;
    for (let r = 0; r < rules.length; r += 1) {
      const block = rules[r];
      if (!(block instanceof CSSMediaRule) || block.media.mediaText !== condition) continue;
      for (let i = 0; i < block.cssRules.length; i += 1) {
        const rule = block.cssRules[i];
        if (rule instanceof CSSStyleRule && rule.selectorText === selector) return rule.style;
      }
    }
  }
  throw new Error(`no rule in the cascade for ${selector} under @media ${condition}`);
}
