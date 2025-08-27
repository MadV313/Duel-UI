# Duel-UI (static server)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Minimal deps to serve the UI
COPY package*.json ./
RUN npm ci --omit=dev || npm i --omit=dev

# Copy site files
COPY . .

# Optional: if you later add a build step, do it here:
# RUN npm run build

# Let Railway map $PORT; server.mjs uses it
EXPOSE 5173

CMD ["node", "server.mjs"]
