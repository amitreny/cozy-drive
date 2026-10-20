import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,ogg,m4a,json,glb,txt}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        name: 'Cozy Drive',
        short_name: 'Cozy Drive',
        description: 'A cozy offline open-world driving game',
        theme_color: '#f3c98b',
        background_color: '#20262e',
        display: 'fullscreen',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 60000 },
});
