import { defineConfig } from 'vite';
import { jq79 } from 'jq79/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Threaded engines need SharedArrayBuffer, and that needs cross-origin isolation.
// The dev and preview servers send the headers; in production (static hosting) the
// service worker adds them to every navigation — see src/sw.js.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: '/',
  plugins: [
    jq79(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'play.germade',
        short_name: 'play',
        description: 'Juegos retro modernos y emuladores en WebAssembly, en tu navegador.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#08090d',
        theme_color: '#08090d',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // The shell only. Engines and covers are cached on first use (src/sw.js);
        // game data lives in OPFS, never in the service worker's caches.
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}', 'icons/*.png'],
        globIgnores: ['engines/**', 'assets/covers/**'],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        play: 'play/index.html',
      },
    },
  },
  server: { headers: isolation },
  preview: { headers: isolation },
});
