# VPN (admin + egress, opt-in MCP)

Catalog id **`vpn`**: HTTP endpoint on **continuum-mcp** (`/mcp/vpn`), **`initialLoad: false`** by default — add from the node MCP catalog and enable **Initial load** when you want these tools in a session. MPA VPN billing multisign tools (`register_vpn_on_linea`, etc.) stay on the main **continuum** MCP server — see `mpc.md`.

WireGuard admin VPN and peer egress flows on the attached node. Read tools use GET management API routes; write and download tools POST management-signed bodies with the preferred Ed25519 management key (same as agent skills and cron jobs).

Prerequisites: local management private key in `added_keys/` (see `management-signer.md`), node attached via SDK config.

Download tools write client files to **user_folder** (default `MPC_AUTH_USER_FOLDER=/app/user_folder`, host bind mount in Docker). Override with optional `userFolder` on download inputs.

## Admin VPN

- `get_vpn_status`
  - GET `/vpn/status` — availability, active profile, obfuscation, billing summary.
- `set_vpn_enabled`
  - POST `/vpn/setEnabled` — `enabled` true/false; when enabling: optional `profile` (`split`|`full`, default `full`), optional `obfuscation`.
  - Triggers host systemd automation via pending VPN file (same as node app Enable/Disable).
- `download_vpn_admin_client_config`
  - POST `/vpn/clientConfig` — optional `profile`, `obfuscation` (when obfuscated), optional `userFolder`.
  - Saves WireGuard `.conf` (and transport proxy file when obfuscated) under user_folder.
  - Returns `wireGuardPath`, optional `transportPath`, and `setupInstructions` when provided.

## Egress (provider + consumer)

- `get_vpn_egress_status`
  - GET `/vpn/egress/status` on **this** node when acting as an egress provider.
- `set_vpn_egress_sharing`
  - POST `/vpn/egress/setSharing` — `enabled`, optional `obfuscation`, optional `defaultRateLimitMbps`.
- `revoke_vpn_egress_peer`
  - POST `/vpn/egress/revokePeer` — `consumerNodeKey` (128-char hex, lowercase).
- `list_vpn_egress_exits`
  - GET `/vpn/egress/availableExits` — exit routes discovered from other nodes (`address`, `publicKey`, country, obfuscation, billing fields).
- `download_vpn_egress_client_config`
  - POST `/vpn/egress/requestClientConfig` — `targetAddress` from an exit row, optional `obfuscation`, optional `userFolder`.
  - Saves `cont-egress.conf` (and transport file when needed) to user_folder.

## Typical flows

**Admin connect:** `get_vpn_status` → ensure billing month active (MPA VPN tools in `mpc.md`) → `set_vpn_enabled` `{ enabled: true, profile: "full" }` → wait for active status → `download_vpn_admin_client_config`.

**Consumer egress:** `list_vpn_egress_exits` → pick `address` → `download_vpn_egress_client_config` `{ targetAddress: "…" }`.

**Provider sharing:** `set_vpn_egress_sharing` `{ enabled: true, defaultRateLimitMbps: 20 }` → revoke with `revoke_vpn_egress_peer` when access should end.
