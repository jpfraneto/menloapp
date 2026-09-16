FROM oven/bun:1.2.18
WORKDIR /app/website
COPY website/package.json website/bun.lock ./
COPY website/apps/companion-relay/package.json ./apps/companion-relay/package.json
RUN bun install --frozen-lockfile --production
COPY website/ ./
COPY packages/cli/src/presentation.js /app/packages/cli/src/presentation.js
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["bun", "apps/site/server.ts"]
