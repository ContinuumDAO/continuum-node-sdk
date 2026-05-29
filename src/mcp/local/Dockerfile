# Build from continuum-node-sdk repository root (npm run build → dist/).
# Runtime via mpc-config docker-compose.yml (service "continuum-mcp").
# Push with src/mcp/local/push-image.sh — see src/mcp/local/README.md.
FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/app
ENV MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_PORT=8446
ENV MCP_HTTP_PATH=/mcp
ENV MPC_AUTH_URL=http://app
ENV MPC_AUTH_PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8446

CMD ["node", "dist/mcp/server/index.js"]
