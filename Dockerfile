FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# Node tries each resolved IP for only 250ms by default: too short for a far-away DB (Neon us-east-2).
ENV NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000
# Embedded Redis, used only when REDIS_URL isn't set (see docker-entrypoint.sh).
RUN apk add --no-cache redis
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chmod=755 docker-entrypoint.sh ./
COPY src ./src
COPY test ./test
USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/server.ts"]
