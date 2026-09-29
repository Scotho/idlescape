import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/** Replace `<!-- @include "path" -->` comments with file contents (recursive). */
function htmlIncludePlugin(): Plugin {
  const INCLUDE_RE = /<!--\s*@include\s+"([^"]+)"\s*-->/g;
  return {
    name: 'html-include',
    transformIndexHtml(html) {
      let out = html;
      // Resolve nested @include directives until none remain.
      while (INCLUDE_RE.test(out)) {
        INCLUDE_RE.lastIndex = 0;
        out = out.replace(
          INCLUDE_RE,
          (_, filePath) => readFileSync(resolve(__dirname, filePath), 'utf-8'),
        );
      }
      return out;
    },
  };
}

export default defineConfig({
  plugins: [htmlIncludePlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/client': 'http://localhost:8787',
      // Keep this list in lockstep with server/src/types.ts CACHE_PREFIXES (274 set:
      // crc,title,config,interface,media,versionlist,textures,wordenc,sounds). `models`
      // was dropped in 274 (OnDemand websocket streams it instead of HTTP); `versionlist`
      // was added.
      '^/(crc|title|config|interface|media|versionlist|textures|wordenc|sounds)': 'http://localhost:8787',
      '^/.*\\.mid$': 'http://localhost:8787',
      '/': { target: 'ws://localhost:8787', ws: true, bypass: req => (req.headers.upgrade === 'websocket' ? undefined : req.url) }
    }
  },
  // The script Worker (src/agent/worker.ts) is a module worker that code-splits: it
  // imports the task library dynamically, and Vite's default IIFE worker format cannot
  // emit more than one chunk. `new Worker(..., { type: 'module' })` needs 'es' anyway.
  worker: { format: 'es' },
  build: {
    outDir: 'dist', emptyOutDir: true,
    // Three pages: the app, one client document per character (SP7), and the living styleguide.
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), play: resolve(__dirname, 'play.html'), styleguide: resolve(__dirname, 'styleguide.html') } }
  }
});
