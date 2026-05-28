import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

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

export default defineConfig({
  plugins: [react(), swVersionStamp()],
  base: '/',
  build: { cssTarget: 'safari15' },
})
