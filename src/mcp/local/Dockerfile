# Build from parent directory (Code/) — only continuum-node-sdk/ is required.
# Uses published @continuumdao/ctm-mpc-defi (not a sibling copy) to avoid nested SDK + path bugs.
# push-image.sh sets the build context; see src/mcp/local/README.md.
ARG CTM_MPC_DEFI_VERSION=0.2.5

FROM node:22-bookworm-slim AS deps

WORKDIR /app

ENV CONTINUUM_SKIP_VENDOR_SYNC=1

COPY continuum-node-sdk/package.json ./
ENV CTM_MPC_DEFI_VERSION=${CTM_MPC_DEFI_VERSION}
RUN node -e " \
	const fs=require('fs'); \
	const v=process.env.CTM_MPC_DEFI_VERSION; \
	const p=JSON.parse(fs.readFileSync('package.json','utf8')); \
	p.dependencies['@continuumdao/ctm-mpc-defi']=v; \
	fs.writeFileSync('package.json',JSON.stringify(p,null,2)); \
	" && npm install --ignore-scripts

FROM deps AS builder

COPY continuum-node-sdk/tsconfig.json ./
COPY continuum-node-sdk/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ARG CTM_MPC_DEFI_VERSION=0.2.5

ENV NODE_ENV=production
ENV HOME=/app
ENV CONTINUUM_SKIP_VENDOR_SYNC=1
ENV MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_PORT=8446
ENV MCP_HTTP_PATH=/mcp
ENV MPC_AUTH_URL=http://app
ENV MPC_AUTH_PORT=8080

COPY continuum-node-sdk/package.json ./
ENV CTM_MPC_DEFI_VERSION=${CTM_MPC_DEFI_VERSION}
RUN node -e " \
	const fs=require('fs'); \
	const v=process.env.CTM_MPC_DEFI_VERSION; \
	const p=JSON.parse(fs.readFileSync('package.json','utf8')); \
	p.dependencies['@continuumdao/ctm-mpc-defi']=v; \
	fs.writeFileSync('package.json',JSON.stringify(p,null,2)); \
	" && npm install --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 8446

CMD ["node", "dist/mcp/server/index.js"]
