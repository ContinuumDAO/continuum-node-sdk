# Build from parent directory (Code/) — continuum-node-sdk/ plus sibling ctm-mpc-defi/.
# npm ci installs @continuumdao/ctm-mpc-defi from the lock file; scripts/docker-overlay-defi.sh
# builds/overlays sibling ctm-mpc-defi so unreleased defi APIs match the SDK.
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

COPY continuum-node-sdk/scripts ./scripts
COPY ctm-mpc-defi ./ctm-mpc-defi-sibling
RUN bash scripts/docker-overlay-defi.sh /app

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

COPY continuum-node-sdk/scripts ./scripts
COPY ctm-mpc-defi ./ctm-mpc-defi-sibling
RUN bash scripts/docker-overlay-defi.sh /app

COPY --from=builder /app/dist ./dist
RUN bash scripts/docker-link-sdk-self.sh /app

EXPOSE 8446

CMD ["node", "dist/mcp/server/index.js"]
