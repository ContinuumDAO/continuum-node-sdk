# Build from parent directory (Code/) — only continuum-node-sdk/ is required.
# Installs @continuumdao/ctm-mpc-defi from npm per package.json / package-lock.json.
# push-image.sh sets the build context; see src/mcp/local/README.md.
#
# Pinned Node base: node:22.22.3-bookworm-slim (digest e21fc…) ships a truncated
# /usr/local/bin/node (~52MB, segfault / exit 139). Use 22.22.2-bookworm-slim until fixed.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e

FROM ${NODE_IMAGE} AS deps

WORKDIR /app

ENV CONTINUUM_SKIP_VENDOR_SYNC=1

COPY continuum-node-sdk/package.json continuum-node-sdk/package-lock.json ./
RUN node --version \
    && test "$(wc -c < /usr/local/bin/node)" -gt 100000000 \
    && npm ci --ignore-scripts

FROM deps AS builder

COPY continuum-node-sdk/tsconfig.json ./
COPY continuum-node-sdk/scripts ./scripts
COPY continuum-node-sdk/src ./src
RUN npm run build

FROM ${NODE_IMAGE} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/app
ENV CONTINUUM_SKIP_VENDOR_SYNC=1
ENV MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_PORT=8446
ENV MCP_HTTP_PATH=/mcp
ENV MPC_AUTH_URL=http://app
ENV MPC_AUTH_PORT=8080

RUN node --version \
    && test "$(wc -c < /usr/local/bin/node)" -gt 100000000

COPY continuum-node-sdk/package.json continuum-node-sdk/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 8446

CMD ["node", "dist/mcp/server/index.js"]
