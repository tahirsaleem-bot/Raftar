FROM node:18-slim

# Chromium + fonts so whatsapp-web.js (puppeteer) can launch a headless browser
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Use the system Chromium (installed above) instead of puppeteer's download
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

# Install prod deps (package-lock is gitignored, so use install, not ci)
COPY package.json ./
RUN npm install --omit=dev

# Copy the rest of the app
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
