FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# Node tries each resolved IP for only 250ms by default: too short for a far-away DB (Neon us-east-2).
ENV NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY test ./test
USER node
EXPOSE 3000
CMD ["node", "src/server.ts"]
