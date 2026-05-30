# Management Signer

This server signs management actions with Ed25519 keys. Management signer tools configure authorized keys on the node and ensure matching local private key material is available for agent-signed requests.

## Goal

Maintain usable local signer keys and keep authorized public keys in sync with the node.

## MCP tools

- `get_management_signers`
  - List allowed management signers configured on the node (`managementKeys` entries with labels and validity).
- `has_management_signer`
  - Check whether the node has an Ed25519 management signer configured (`hasEdDSAKey`).
- `list_management_signers_detailed`
  - List allowed signers with preferred signer, per-key nonce, local file name, and local private-key availability.
- `get_preferred_management_signer`
  - Read the resolved preferred management signer public key.
- `get_management_signer`
  - Read the preferred signer with `nonce` and `nodeKey` (signing context for the active signer).
- `set_preferred_management_signer`
  - Set the preferred management signer (signs internally with Ed25519).
- `add_management_signer`
  - Add a new Ed25519 management signer on the node; the server generates the key pair and writes files under `mpcConfigPath/added_keys` (Docker: `/app/added_keys/added_key_<N>`). Requires an existing authorized signer with a local private key.
- `create_management_signer_keypair`
  - **Deprecated.** Generates a local keypair only (does not register on the node). Prefer `add_management_signer`.

Low-level SDK helpers (`buildManagementPostRequest`, `managementSign`, `buildAddManagementSigner`, and similar build/sign/post steps) are **not** registered as MCP tools. Clients must use the tools above or route tools that sign internally.

## Key lifecycle

1. Check whether any Ed25519 management signer is configured
   - `has_management_signer`
2. Inspect current signer state
   - `get_management_signers` for node authorization list
   - `list_management_signers_detailed` before signed workflows (preferred signer, nonce, local key status)
3. Add a new authorized signer (normal path)
   - `add_management_signer` — node generates the key pair server-side
4. Set default signer for signed tools
   - `set_preferred_management_signer` with a 64-character hex Ed25519 public key
5. (Optional) read signing context
   - `get_management_signer` for `publicKey`, `nonce`, and `nodeKey`

## `list_management_signers_detailed` output use

Response fields:

- `preferredSigner` (top-level, when resolvable)
- Per key in `keys`:
  - `localFileName`
  - `kind` (`EdDSA`)
  - `value` (public key)
  - `nonce`
  - `label`
  - `localPrivateKeyAvailable`
  - `localPrivateKeyError` (when missing or unusable)

Use this as the source of truth before any signed operation.

## Adding a management signer

`add_management_signer`:

- takes no arguments
- signs `{ nonce, clientSig: "", nodeKey }` with an existing authorized management key (Ed25519)
- POST `/addManagementKey`
- returns `publicKey`, `nodeKey`, and optionally `keySlot`, `fileName`, `privateKeyPath`, `publicKeyPath` from the node response

The node writes key files under `mpcConfigPath/added_keys`. Use this for normal operation.

## Deprecated local keypair generation

`create_management_signer_keypair`:

- writes files under `mpcConfigPath/added_keys`
- labels file as `added_key_{N}` based on current key count
- returns generated public key and file paths
- does **not** authorize the new key on the node

Use only when you need a local key file before node authorization is possible (bootstrap / offline generation).

## Preferred signer rules

`set_preferred_management_signer`:

1. Requested public key must already be in allowed management keys.
2. Matching local private key must exist and be readable (bootstrap key or `added_keys` entry).
3. Private key must derive to the same Ed25519 public key.

If any check fails, the tool returns a clear error and does not call `/setPreferredSigner`.

Signer resolution for signed route tools (server-side):

1. If a preferred signer is set: it must be allowed and have a usable local keypair.
2. Otherwise: the server uses the first allowed key with a usable local private key.
3. If none qualify: the tool fails with an explicit error.

## Operational checks

- If only a bootstrap key exists, ensure its private key is present locally under `mpcConfigPath/bootstrap_key`.
- If preferred signer is set to a key not available locally, signed tools will fail.
- If key files are moved or renamed manually, local key matching can fail.
- If `localPrivateKeyAvailable` is false, signing tools will fail for that key.

## Recommended client behavior

- Refresh `list_management_signers_detailed` before each signed workflow.
- Show preferred signer and nonce when asking for approval.
- Prefer explicit error surfacing (missing private key, unauthorized key, nonce mismatch, parse errors).
- Load `sign.md` for how signed route tools use the preferred signer internally.
