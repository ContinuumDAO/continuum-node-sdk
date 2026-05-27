# EIP-191 management signing in web apps (wagmi / viem)

Use this when building a browser UI that calls Continuum Node SDK functions with a connected wallet instead of a local Ed25519 key.

## How the SDK fits together

Most SDK exports accept an optional third argument:

```typescript
signing?: ManagementSigningMethod  // defaults to { kind: 'ed25519' }
```

For wallet-based signing, pass `{ kind: 'eip191', signMessage }`. The SDK does **not** call `window.ethereum` itself — it calls **your** `signMessage` callback. That is where wagmi or viem plugs in.

Typical flow for a signed management action (e.g. `createGroupRequest`):

1. **`buildCreateGroupRequest`** (or another `build*` export) validates input and returns `{ path, unsignedBody, canonicalJson }` with `clientSig: ""`, `nonce`, and `nodeKey` populated.
2. **`managementSign(config, signing, unsignedBody)`** calls your `signMessage(canonicalJson)` for EIP-191.
3. **`managementPost(config, path, signedBody)`** sends `{ clientSig, nodeKey, nonce, ...fields, signedMessage }`.

All-in-one exports (e.g. `createGroupRequest`) run these three steps internally. For step-by-step UI control, call `build*` → `managementSign` → `managementPost` yourself.

Ed25519 (Node/MCP default) skips the wallet in step 2 and signs locally with a node key file.

## Minimal wagmi example

```typescript
import { useSignMessage, useAccount } from 'wagmi';
import {
  createGroupRequest,
  type EIP191ManagementSigning,
  type NodeSdkConfig,
} from '@continuumdao/continuum-node-sdk';

function buildEip191Signing(
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
): EIP191ManagementSigning {
  return {
    kind: 'eip191',
    signMessage: (message) => signMessageAsync({ message }),
  };
}

// Inside a click handler (after wallet is connected):
const { signMessageAsync } = useSignMessage();
const signing = buildEip191Signing(signMessageAsync);

const result = await createGroupRequest(
  config,
  { nodeIds: ['...', '...'] },
  signing,
);

if (!result.ok) {
  // show result.reason
}
```

Pass the same `signing` object to any signed export: `acceptGroupRequest`, `createKeyGenRequest`, registry add/remove helpers, `triggerSignResult`, `shelveSignRequest`, etc. For atomic UI flows, pass it to `managementSign` after a `build*` call.

## viem without wagmi hooks

If you already have a `WalletClient` and account address:

```typescript
import { type Address, type WalletClient } from 'viem';
import type { EIP191ManagementSigning } from '@continuumdao/continuum-node-sdk';

function eip191FromViem(
  walletClient: WalletClient,
  account: Address,
): EIP191ManagementSigning {
  return {
    kind: 'eip191',
    signMessage: (message) => walletClient.signMessage({ account, message }),
  };
}
```

With wagmi, `useWalletClient()` + `useAccount()` gives you the same inputs.

## Config and CORS

`NodeSdkConfig` only needs the node’s management API reachable from the browser:

```typescript
const config: NodeSdkConfig = {
  node: {
    baseUrl: 'https://your-node.example.com',
    managementPort: 8080,
    mpcConfigPath: '/path/on/server', // unused for EIP-191 signing in the browser
  },
  signer: {
    defaultKey: 'unused-in-browser',
    defaultKeyPath: null,
  },
};
```

If the UI and node are on different origins, proxy management requests through your app backend or enable CORS on the node. The SDK uses plain `fetch` to the management port.

## Helpful nuances

**Message format.** Management POSTs sign management canonical JSON (not raw `JSON.stringify` of the POST body). Your adapter only receives the final string to sign — do not re-serialize or hash it yourself.

**`signedMessage` on POST.** EIP-191 bodies include `signedMessage` (the canonical string) plus `clientSig`. Ed25519 bodies omit `signedMessage`. The SDK adds this automatically when `kind: 'eip191'`.

**No `selectedSigningKey` for EIP-191.** Return types may omit `selectedSigningKey`; the node identifies the signer from the wallet signature, not an Ed25519 public key list.

**MPC multi-sign exception.** `signAndSubmitMultiSignRequest` also accepts EIP-191, but signs `JSON.stringify(bodyForSign)` (MPC proposal format), not management canonical JSON. Same `signMessage` callback; different bytes.

**Strips `0x`.** The SDK normalizes `clientSig` by trimming and removing a leading `0x`. Hex with or without prefix from wagmi/viem is fine.

**Connect before calling.** Guard UI actions until a wallet account exists; `signMessage` will fail otherwise.

**MCP / server.** MCP tools always use Ed25519. Wallet signing is browser (or any app that can supply `signMessage`) only.

## Reusable app helper (optional)

Centralize the adapter so every screen passes the same object:

```typescript
// lib/continuum-signing.ts
import type { EIP191ManagementSigning } from '@continuumdao/continuum-node-sdk';

export function createEip191Signing(
  signMessageAsync: (args: { message: string }) => Promise<string>,
): EIP191ManagementSigning {
  return {
    kind: 'eip191',
    signMessage: (message) => signMessageAsync({ message }),
  };
}
```

No React hook required — pass `signMessageAsync` from wagmi wherever you invoke SDK calls.
