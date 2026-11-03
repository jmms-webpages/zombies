import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `host: true` makes the dev server listen on 0.0.0.0 so GitHub Codespaces
// can forward the port to your browser.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
  test: {
    environment: 'node', // UI tests opt in to jsdom with a `@vitest-environment jsdom` docblock
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
