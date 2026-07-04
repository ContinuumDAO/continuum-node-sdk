# Continuum Node SDK

TypeScript SDK for the Continuum node **management API**. It exposes typed functions for node administration, MPC groups, KeyGen, chain/token/address registries, and multi-sign (MPC) workflows. Results use a consistent `SdkResult<T>` shape (`{ ok, data }` or `{ ok, reason }`).

Management requests can be signed with **Ed25519** (local node keys, default for Node/MCP) or **EIP-191** (browser wallet via a `signMessage` callback). The SDK builds canonical signing payloads and POST bodies; callers supply config and, for wallet flows, a signing adapter.

An optional **MCP** layer registers the same core functions as Model Context Protocol tools for agent use (Ed25519 only). The continuum MCP server also exposes **chart analysis** tools (trend, momentum, key levels, and **candlestick pattern recognition**) over normalized OHLCV data.

## Install

```bash
npm install @continuumdao/continuum-node-sdk
```

Requires Node.js 18+.

## Quick example

```typescript
import {
  parseNodeSdkConfig,
  nodeId,
  createGroupRequest,
  DEFAULT_MANAGEMENT_SIGNING,
} from '@continuumdao/continuum-node-sdk';

const config = parseNodeSdkConfig({
  node: {
    baseUrl: 'https://your-node.example.com',
    managementPort: 8080,
    mpcConfigPath: '/path/on/server',
  },
  signer: { defaultKey: 'default', defaultKeyPath: null },
});

const id = await nodeId(config);
if (!id.ok) throw new Error(id.reason);

const result = await createGroupRequest(
  config,
  { nodeIds: ['...', '...'] },
  DEFAULT_MANAGEMENT_SIGNING,
);
```

## Documentation

- **[API reference](./docs/api-reference.md)** — exported functions, inputs, and outputs
- **[EIP-191 + wagmi/viem](./docs/eip191-wagmi-viem.md)** — wallet signing in web apps
- **[Chart analysis (MCP)](./src/mcp/resources/chart-analysis.md)** — `analyze_*` tools including **`analyze_candlestick_patterns`**

### Candlestick pattern recognition

The **`analyze_candlestick_patterns`** MCP tool detects **18 TA-Lib-style patterns** on OHLCV candlesticks (minimum **14 bars**), returning each match with a **name**, **description**, **buy/sell/hold** recommendation, and **confidence**.

| Category | Patterns |
|----------|----------|
| Single-bar indecision | Doji, Spinning Top, Long-Legged Doji, Dragonfly Doji, Gravestone Doji |
| Single-bar reversal | Hammer, Hanging Man, Shooting Star, Inverted Hammer, Marubozu |
| Two-bar | Engulfing, Harami, Piercing Line, Dark Cloud Cover |
| Three-bar | Morning Star, Evening Star, Three White Soldiers, Three Black Crows |

Full descriptions, ids for `patterns[]` filters, and tool examples: **[chart-analysis.md](./src/mcp/resources/chart-analysis.md)**. SDK implementation: `src/core/candlestick-patterns/`.

## Development

```bash
npm run build
```

Build output is emitted to `dist/`.
