import { defineConfig } from "astro/config";

function publicIndexRewrite() {
  return {
    name: 'public-index-rewrite',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.endsWith('/')) {
          req.url += 'index.html';
        }
        next();
      });
    }
  };
}

export default defineConfig({
  output: "static",
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  vite: {
    plugins: [publicIndexRewrite()]
  }
});
