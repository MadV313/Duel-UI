# Duel-UI (Node static + proxy server)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install only production deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm i --omit=dev --no-audit --no-fund

# Copy the rest of the app
COPY . .

# Railway will set $PORT; server.mjs listens on it (defaults to 8080)
EXPOSE 8080

CMD ["node", "server.mjs"]
