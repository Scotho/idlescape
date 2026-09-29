import type { Page } from './types';
import type { Draft } from './render/page';
import type { LintProblem } from './render/overlay';

const SECOND_PERSON = /\b(you|your|you're|yourself)\b/i;
const SECOND_PERSON_OK = new Set(['Walkthrough', 'Strategy']);

export function lintPages(pages: Page[], drafts: Draft[], denylist: string[]): LintProblem[] {
  const out: LintProblem[] = [];
  const deny = denylist.map(s => s.trim().toLowerCase()).filter(s => s.split(/\s+/).length >= 12);
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!, d = drafts[i]!;
    const id = `${page.type}/${page.slug}`;
    const push = (rule: string, message: string, level: 'error' | 'warn' = 'error') => out.push({ rule, page: id, message, level });
    if (!page.lead.includes(`**${page.title}**`)) push('lead-bold', 'lead does not bold the page title');
    for (const s of d.sections) {
      if (s.required && !s.body.trim()) push('required-sections', `required section "${s.heading}" is a stub`, 'warn');
      if (s.body.trim() && s.meta.sources.length === 0) push('section-sources', `section "${s.heading}" has no sources`);
      if (d.type !== 'guide' && !SECOND_PERSON_OK.has(s.heading) && SECOND_PERSON.test(s.body)) push('second-person', `section "${s.heading}" addresses the reader`);
    }
    if (d.type !== 'guide' && SECOND_PERSON.test(page.lead)) push('second-person', 'lead addresses the reader');
    const unresolved = page.markdown.match(/\[\[[^\]]+\]\]/g) ?? [];
    for (const u of unresolved) push('unresolved-links', `${u} was not resolved`);
    if (/\\\[\\\[/.test(page.markdown)) push('unresolved-links', 'a backslash-escaped [[ wikilink was found; a typed link was corrupted before finalizeLinks ran');
    // `pages.lead` is stored and served on its own (page JSON, plan-context, the FTS lead column),
    // so it has to be finalized markdown - never raw or escaped wikilink syntax.
    if (page.lead.includes('[[') || /\\\[\\\[/.test(page.lead)) push('unresolved-links', 'the stored lead still contains wikilink syntax');
    const lower = page.markdown.toLowerCase();
    for (const s of deny) if (lower.includes(s)) push('denylist', `contains a denylisted sentence: "${s.slice(0, 40)}…"`);
  }
  return out;
}
