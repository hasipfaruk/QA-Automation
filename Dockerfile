# Production image. The base image ships the browser engine and its system libraries.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    SEED_DEMO_USERS=false \
    ALLOW_PRIVATE_URLS=false

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --omit=dev && npx playwright install chromium && npm cache clean --force

COPY backend/src ./backend/src
COPY backend/bin ./backend/bin
COPY backend/scripts ./backend/scripts
COPY frontend/public ./frontend/public

RUN mkdir -p /data && chown -R pwuser:pwuser /data /app
USER pwuser

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "backend/src/server.js"]
