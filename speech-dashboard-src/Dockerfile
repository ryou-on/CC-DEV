FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg tesseract-ocr tesseract-ocr-jpn tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY src/meta.js ./src/meta.js
ENV APP_MODE=cloud PORT=8080 NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
