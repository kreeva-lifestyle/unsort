import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { zipSync } from 'fflate'

function swVersionStamp(): Plugin {
  return {
    name: 'sw-version-stamp',
    writeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js');
      try {
        const src = readFileSync(swPath, 'utf-8');
        writeFileSync(swPath, src.replaceAll('__BUILD_TS__', String(Date.now())));
      } catch {}
    },
  };
}

// Settings → Pack Cam → "PC program (zip)": the office-PC agent
// (tools/packcam-agent) zipped from the code on every build, so the download
// is never out of date. No config.json and no key: the agent reads
// config.example.json when config.json is missing, and keeps its key in
// key.txt in its data folder — unzipping a new version over an old one never
// touches either.
const PACKCAM_ZIP = 'packcam/PackCam-PC-Setup.zip';
function packcamZipBytes(): Uint8Array {
  const root = resolve(__dirname, 'tools/packcam-agent');
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (['test', 'node_modules', '.gitignore', 'config.json', 'key.txt'].includes(name)) continue;
      const full = resolve(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${rel}${name}/`);
      else files[`agent/${rel}${name}`] = readFileSync(full);
    }
  };
  walk(root, '');
  return zipSync(files, { level: 9 });
}
function packcamZip(): Plugin {
  return {
    name: 'packcam-zip',
    generateBundle() { this.emitFile({ type: 'asset', fileName: PACKCAM_ZIP, source: packcamZipBytes() }); },
    configureServer(server) {
      server.middlewares.use(`/${PACKCAM_ZIP}`, (_req, res) => { res.setHeader('content-type', 'application/zip'); res.end(Buffer.from(packcamZipBytes())); });
    },
  };
}

export default defineConfig({
  plugins: [react(), swVersionStamp(), packcamZip()],
  base: '/',
  build: { cssTarget: 'safari15' },
  // Build stamp shown in the ?vpdebug overlay — lets a device screenshot prove
  // which build it is actually running (stale-cache diagnosis).
  define: { __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
})
