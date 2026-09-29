import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BUILD, OVERLAYS } from './paths';
import { readData } from './extract';
import { loadOverlays, renderAll } from './render';
import { lintPages } from './lint';
import { buildDb } from './db';
import type { LintProblem } from './render/overlay';

const TOP_PROBLEM_RULES = new Set(['duplicate-page', 'unresolved-links', 'section-sources']);

function report(problems: LintProblem[], counts: Record<string, number>, pages: { type: string; sections: Record<string, { confidence: string }> }[], stubs: Map<string, number>): string {
  const byRule = new Map<string, number>();
  for (const p of problems) byRule.set(`${p.level}:${p.rule}`, (byRule.get(`${p.level}:${p.rule}`) ?? 0) + 1);
  const perType = new Map<string, number>();
  for (const p of pages) perType.set(p.type, (perType.get(p.type) ?? 0) + 1);
  const topProblems = problems.filter(p => TOP_PROBLEM_RULES.has(p.rule)).slice(0, 20);
  return [
    '# Wiki build report', '', `Generated ${new Date().toISOString()}`, '',
    '## Counts', '', ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`), '',
    '## Pages per type', '', ...[...perType.entries()].map(([t, n]) => `- ${t}: ${n} (required stubs: ${stubs.get(t) ?? 0})`), '',
    '## Lint', '', ...(byRule.size ? [...byRule.entries()].map(([k, n]) => `- ${k}: ${n}`) : ['- clean']), '',
    '## First 50 problems', '', ...problems.slice(0, 50).map(p => `- ${p.level} ${p.rule} ${p.page}: ${p.message}`), '',
    '## Top 20 duplicate-page / unresolved-links / section-sources problems', '', ...(topProblems.length ? topProblems.map(p => `- ${p.level} ${p.rule} ${p.page}: ${p.message}`) : ['- none']), '',
  ].join('\n');
}

export function runBuild(opts: { lintOnly: boolean }): number {
  const data = readData();
  const overlays = loadOverlays(OVERLAYS);
  const { pages, drafts, problems } = renderAll(data, overlays);
  const denyPath = path.join(import.meta.dir, 'denylist.txt');
  const deny = existsSync(denyPath) ? readFileSync(denyPath, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  problems.push(...lintPages(pages, drafts, deny));
  const stubs = new Map<string, number>();
  for (const d of drafts) for (const s of d.sections) if (s.required && !s.body.trim()) stubs.set(d.type, (stubs.get(d.type) ?? 0) + 1);
  mkdirSync(BUILD, { recursive: true });
  writeFileSync(path.join(BUILD, 'report.md'), report(problems, data.manifest.counts, pages, stubs));
  const errors = problems.filter(p => p.level === 'error');
  console.log(`[wiki] ${pages.length} pages, ${errors.length} lint errors, ${problems.length - errors.length} warnings -> build/report.md`);
  if (errors.length) {
    for (const e of errors.slice(0, 20)) console.error(`  ${e.rule} ${e.page}: ${e.message}`);
    return 1;
  }
  if (!opts.lintOnly) {
    buildDb(path.join(BUILD, 'wiki.db'), data, pages);
    console.log(`[wiki] wrote build/wiki.db`);
  }
  return 0;
}

if (import.meta.main) process.exit(runBuild({ lintOnly: process.argv.includes('--lint-only') }));
