# Node database and management keys

Encrypted MongoDB backup/restore and on-disk Ed25519 management key files. Activate deferred groups before use (`search_continuum_tools` / `activate_tool_group`):

| Pack | Router alias | Tools |
|------|----------------|-------|
| **`node_database:backup`** | `node:db-backup` | list/check/backup/restore, fetch/post backup, maintenance prep |
| **`node_database:bootstrap`** | `node:bootstrap-key` | fetch/post/remove bootstrap seed |
| **`node_database:added-keys`** | `node:added-keys` | fetch/post/remove added signer key files |

Legacy **`node_database`** expands to all three packs.

## Operator approval (agent host)

These tools require **interactive human approval** in the agent chat UI before the host executes them:

- **`restore_database`** — destructive; wipes and replaces databases in the backup envelope.
- **`remove_bootstrap_key`** — deletes the bootstrap seed file; without an off-node backup you may lose decrypt/recovery ability.

They still require their normal tool arguments (e.g. `confirmRestore: true` for restore). Cron/specialist runs without approval UI are blocked.

## Prerequisites

- Management signing configured (preferred Ed25519 signer with local private key).
- **Deterministic nodeKey** + bootstrap seed for backup/export routes (legacy random-nodeKey nodes get 403).
- **HTTPS or loopback** management URL for `fetch_*` key/backup download routes.

## Maintenance quiescence

Backup, restore, and sensitive fetch tools call **`request_maintenance_restart_prep`** and poll **`get_maintenance_restart_gate`** until `readyForProcessExit` unless `skipQuiescence: true`. Bootstrap/added key post/remove are **not** drained.

## Backup workflow

1. **`list_database_backups`** — existing backups.
2. **`backup_database`** — create encrypted snapshot under `database_backups/`.
3. **`fetch_database_backup`** — download to `userFolderPath` (e.g. `data/backups/<backupId>`) or small `contentBase64`.
4. **`post_database_backup`** — upload from `userFolderPath` or base64.
5. **`restore_database`** — **destructive**; requires `confirmRestore: true`. Then run **`check_database`**.

## Bootstrap key files

| Tool | Route |
|------|--------|
| `fetch_bootstrap_key` | Export seed (TLS/loopback) |
| `post_bootstrap_key` | Install `bootstrap_key/ed25519_private.hex` |
| `remove_bootstrap_key` | Delete bootstrap seed file |

## Added signer key files

Requires **`POST /addManagementKey`** first (Mongo + one-time PEM at creation). These tools manage **disk copies** under `added_keys/`:

| Tool | Route |
|------|--------|
| `fetch_added_management_key` | Export PEM + seed by `publicKeyHex` |
| `post_added_management_key` | Install `added_key_<N>` when absent |
| `remove_added_management_key` | Delete PEM + `.pub` only |

Use **`remove_management_signer`** to soft-remove the key from Mongo lifecycle.

## Security

- Never paste private keys or backup ciphertext into follow-up chat.
- Restore wipes databases present in the backup envelope.
- Prefer **`user_folder`** paths over inline base64 for backups >4 MiB.
