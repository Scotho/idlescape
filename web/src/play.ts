// web/src/play.ts -- the entry point of one character's client document (web/play.html).
//
// This runs inside the shell's iframe, never in the parent. `loadClient()` imports the 274
// bundle and constructs `Client`, which installs `window.idlescape.{client,plugins}` into *this*
// realm; the parent reaches them through `iframe.contentWindow`. Nothing here knows which
// character it is: the parent arms the credentials with `hooks.armLogin(...)` once it sees the
// hooks appear, and the title screen's Login button does the rest.
import { loadClient } from './clientHost';

void loadClient().catch((err: unknown) => {
  console.error('[idlescape] client failed to load', err);
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d');
  if (!ctx || !canvas) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e0a030';
  ctx.font = '14px sans-serif';
  ctx.fillText('Could not start the game client. Reload the page.', 24, 40);
});
