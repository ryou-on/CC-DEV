import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', use: { baseURL: 'http://127.0.0.1:4173/speech-dashboard/', headless: true },
  webServer: [{ command: 'npm run preview', url: 'http://127.0.0.1:4173/speech-dashboard/', reuseExistingServer: !process.env.CI }, { command: 'node server/index.js', url: 'http://127.0.0.1:8080/api/speech/health', reuseExistingServer: !process.env.CI }]
});
