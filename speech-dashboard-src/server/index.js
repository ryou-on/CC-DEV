import { createApp } from './app.js';
const mode = process.env.APP_MODE || 'local';
const server = createApp({ mode }).listen(Number(process.env.PORT || 8080), mode === 'local' ? '127.0.0.1' : '0.0.0.0', () => console.log(`speech-dashboard ${mode}: listening`));
server.requestTimeout = 900000;
