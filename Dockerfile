FROM node:20-slim

# Chromium renders the record PDF. Installing the system package and pointing
# puppeteer-core at it keeps the image far smaller than puppeteer's own download,
# and the fonts matter - without them the PDF falls back to a substitute face and
# the layout shifts.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "src/server.js"]
