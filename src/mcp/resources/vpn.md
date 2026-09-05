# VPN (admin + egress, opt-in MCP)

Catalog id **`vpn`**: HTTP endpoint on **continuum-mcp** (`/mcp/vpn`), **`initialLoad: false`** by default — add from the node MCP catalog and enable **Initial load** when you want these tools in a session.

WireGuard admin VPN and peer egress flows on the attached node. Read tools use GET management API routes; write and download tools POST management-signed bodies with the preferred Ed25519 management key (same as agent skills and cron jobs).

VPN is a **veCTM privilege**, not a paid month. Before enabling, confirm entitlement with `get_node_privilege_status` on the main **continuum** MCP server (`keygen_billing`). `entitled` is true when this node is a member of a `groupId` (via `attachVeCtm` or `register`) whose recorded attach key still has a qualifying veCTM NFT this month (`balanceOfNFTAt` at UTC month start vs `veCtmThresholdPower`). Inbound governor `getVotes` / delegation to the KeyGen do not count. The current `nodeWithdrawAuthority` need not hold that NFT — privilege survives authority rotation. `get_ve_ctm_attach_status` is KeyGen-scoped (does *this* address own an attached NFT) and is **not** the VPN gate. `claim_node_withdraw_authority` is required to attach or register, not to enable VPN. Node trial does not grant VPN.

Prerequisites: local management private key in `added_keys/` (see `management-signer.md`), node attached via SDK config.

Download tools write client files to **user_folder/data/vpn/** (default `MPC_AUTH_USER_FOLDER=/app/user_folder`, host bind mount in Docker). Override with optional `userFolder` on download inputs.

## Admin VPN

- `get_vpn_status`
  - GET `/vpn/status` — availability, active profile, obfuscation, privilege hints (`privileged`, `privilegeSource`).
  - `privileged` is the same node-scoped entitlement as `get_node_privilege_status`, not “current authority holds the NFT”.
- `set_vpn_enabled`
  - POST `/vpn/setEnabled` — `enabled` true/false; when enabling: optional `profile` (`split`|`full`, default `full`), optional `obfuscation`.
  - Enabling requires node veCTM privilege (`get_node_privilege_status.entitled`). Management-signed; does not require the current withdraw authority to hold the NFT.
  - Triggers host systemd automation via pending VPN file (same as node app Enable/Disable).
- `download_vpn_admin_client_config`
  - POST `/vpn/clientConfig` — optional `profile`, `obfuscation` (when obfuscated), optional `userFolder`.
  - Saves WireGuard `.conf` (and transport proxy file when obfuscated) under `user_folder/data/vpn/`.
  - Returns `wireGuardPath`, optional `transportPath`, and `setupInstructions` when provided.

## Egress (provider + consumer)

- `get_vpn_egress_status`
  - GET `/vpn/egress/status` on **this** node when acting as an egress provider (`privileged` is node-scoped, same as admin VPN).
- `set_vpn_egress_sharing`
  - POST `/vpn/egress/setSharing` — `enabled`, optional `obfuscation`, optional `defaultRateLimitMbps`.
  - Enabling sharing requires the same node veCTM privilege as admin VPN.
- `revoke_vpn_egress_peer`
  - POST `/vpn/egress/revokePeer` — `consumerNodeKey` (128-char hex, lowercase).
- `list_vpn_egress_exits`
  - GET `/vpn/egress/availableExits` — exit routes discovered from other nodes (`address`, `publicKey`, country, obfuscation, privilege fields).
  - Remote exits are independently privilege-checked on-chain; this node must also be entitled to consume.
- `download_vpn_egress_client_config`
  - POST `/vpn/egress/requestClientConfig` — `targetAddress` from an exit row, optional `obfuscation`, optional `userFolder`.
  - Requires this node’s veCTM privilege (consumer). Saves `cont-egress.conf` (and transport file when needed) to `user_folder/data/vpn/`.

## Typical flows

**Admin connect:** `get_node_privilege_status` (`entitled` true) → `set_vpn_enabled` `{ enabled: true, profile: "full" }` → wait for active status → `download_vpn_admin_client_config`. If not entitled, attach via `attach_ve_ctm_to_node` from the authority KeyGen that owns the NFT (then `register` that `groupId` if needed) — do not treat a missing attach on the *current* authority as “node not entitled”.

**Consumer egress:** `list_vpn_egress_exits` → pick `address` → `download_vpn_egress_client_config` `{ targetAddress: "…" }`.

**Provider sharing:** `set_vpn_egress_sharing` `{ enabled: true, defaultRateLimitMbps: 20 }` → revoke with `revoke_vpn_egress_peer` when access should end.
