# Build from parent directory (Code/) with continuum-node-sdk/ and ctm-mpc-defi/ siblings.
# push-image.sh sets the build context; see src/mcp/local/README.md.
FROM node:22-bookworm-slim AS defi-builder

WORKDIR /build/ctm-mpc-defi

COPY ctm-mpc-defi/package.json ctm-mpc-defi/package-lock.json ./
RUN npm ci

COPY ctm-mpc-defi/ ./
RUN npm run build

FROM node:22-bookworm-slim AS deps

WORKDIR /app

ENV CONTINUUM_SKIP_VENDOR_SYNC=1

COPY continuum-node-sdk/package.json continuum-node-sdk/package-lock.json ./
COPY --from=defi-builder /build/ctm-mpc-defi ./vendor/ctm-mpc-defi
RUN npm ci --ignore-scripts

FROM deps AS builder

COPY continuum-node-sdk/tsconfig.json ./
COPY continuum-node-sdk/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/app
ENV CONTINUUM_SKIP_VENDOR_SYNC=1
ENV MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_PORT=8446
ENV MCP_HTTP_PATH=/mcp
ENV MPC_AUTH_URL=http://app
ENV MPC_AUTH_PORT=8080

COPY continuum-node-sdk/package.json continuum-node-sdk/package-lock.json ./
COPY --from=defi-builder /build/ctm-mpc-defi ./vendor/ctm-mpc-defi
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 8446

CMD ["node", "dist/mcp/server/index.js"]
