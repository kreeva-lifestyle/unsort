import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { strToU8, zipSync } from 'fflate'

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
// is never out of date. config.json is config.example.json with a key
// placeholder the agent recognises (it refuses to start until a real key is in).
// The update zip is the same without config.json, so unzipping it over an
// installed copy keeps that PC's key and settings.
const PACKCAM_ZIP = 'packcam/PackCam-PC-Setup.zip';
const PACKCAM_UPDATE_ZIP = 'packcam/PackCam-PC-Update.zip';
const PACKCAM_AGENT_VERSION: string = JSON.parse(readFileSync(resolve(__dirname, 'tools/packcam-agent/package.json'), 'utf-8')).version;
function packcamZipBytes(withConfig: boolean): Uint8Array {
  const root = resolve(__dirname, 'tools/packcam-agent');
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (['test', 'node_modules', '.gitignore', 'config.json'].includes(name)) continue;
      const full = resolve(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${rel}${name}/`);
      else files[`agent/${rel}${name}`] = readFileSync(full);
    }
  };
  walk(root, '');
  if (!withConfig) return zipSync(files, { level: 9 });
  const config = { ...JSON.parse(readFileSync(resolve(root, 'config.example.json'), 'utf-8')), agent_key: 'PASTE-THE-KEY-HERE' };
  files['agent/config.json'] = strToU8(JSON.stringify(config, null, 2).replace(/\n/g, '\r\n') + '\r\n');
  return zipSync(files, { level: 9 });
}
function packcamZip(): Plugin {
  return {
    name: 'packcam-zip',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: PACKCAM_ZIP, source: packcamZipBytes(true) });
      this.emitFile({ type: 'asset', fileName: PACKCAM_UPDATE_ZIP, source: packcamZipBytes(false) });
    },
    configureServer(server) {
      for (const [url, withConfig] of [[PACKCAM_ZIP, true], [PACKCAM_UPDATE_ZIP, false]] as const)
        server.middlewares.use(`/${url}`, (_req, res) => { res.setHeader('content-type', 'application/zip'); res.end(Buffer.from(packcamZipBytes(withConfig))); });
    },
  };
}

export default defineConfig({
  plugins: [react(), swVersionStamp(), packcamZip()],
  base: '/',
  build: { cssTarget: 'safari15' },
  // Build stamp shown in the ?vpdebug overlay — lets a device screenshot prove
  // which build it is actually running (stale-cache diagnosis).
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
    // Settings → Pack Cam says "update the PC" when the PC runs an older agent.
    __PACKCAM_AGENT_VERSION__: JSON.stringify(PACKCAM_AGENT_VERSION),
  },
})
