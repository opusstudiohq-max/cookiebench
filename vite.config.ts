import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` must match the GitHub Pages sub-path (https://<user>.github.io/<repo>/).
// Override with BASE_PATH=/ when deploying to a custom domain or apex host.
const base = process.env.BASE_PATH ?? '/cookiebench/';

export default defineConfig({
  base,
  plugins: [react()],
  define: {
    // @solana/web3.js reaches for Node globals; map them onto the browser.
    global: 'globalThis',
  },
  resolve: {
    alias: { buffer: 'buffer/' },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          solana: ['@solana/web3.js'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
