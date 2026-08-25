import { defineConfig } from 'tsdown'

/** Build the service bundle; the Typert generator emits `typert.host`/`remote-client` during the Host pass. */
export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
