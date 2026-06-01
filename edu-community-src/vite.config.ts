import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/edu-community/',
  build: {
    outDir: '../public/edu-community',
    emptyOutDir: true,
  },
})
