import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  base: '/speech-dashboard/', plugins: [react(), tailwind()],
  build: { outDir: 'public/speech-dashboard', emptyOutDir: true },
  publicDir: false,
  server: { port: 5173, strictPort: true, proxy: { '/api/speech': 'http://127.0.0.1:8080' } },
  preview: { port: 4173, strictPort: true, proxy: { '/api/speech': 'http://127.0.0.1:8080' } }
});
