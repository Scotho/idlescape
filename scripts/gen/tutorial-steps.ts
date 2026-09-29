// Builds web/src/tasks/library/tutorialIsland/steps.ts from the pinned engine/content clone.
// Run by scripts/build.ps1 with --check; run by hand without it after a content bump.
//
//   bun scripts/gen/tutorial-steps.ts            # write
//   bun scripts/gen/tutorial-steps.ts --check    # fail if the committed file is stale
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractTutorialSteps, renderStepsModule } from '../../web/src/data/gen/tutorialSteps';
import { CONTENT, ROOT, writeOrCheckText } from './lib/io';

const check = process.argv.includes('--check');

const SOURCE = join(CONTENT, 'scripts', 'tutorial', 'scripts', 'tut_chatbox_steps.rs2');
const OUT = join(ROOT, 'web', 'src', 'tasks', 'library', 'tutorialIsland', 'steps.ts');

const steps = extractTutorialSteps(readFileSync(SOURCE, 'utf8'));

// A chatbox script with no steps in it is a content path that moved, not a tutorial with nothing
// to do. Failing here is the difference between a build that stops and a script that matches no
// title and goes stuck on the island for twenty-five minutes.
if (steps.length === 0) throw new Error(`no ~tutorialstep calls in ${SOURCE}; the content layout moved`);

console.log(`${steps.length} tutorial steps, ${steps.filter(s => s === '').length} of them untitled`);
writeOrCheckText(OUT, renderStepsModule(steps), check);
