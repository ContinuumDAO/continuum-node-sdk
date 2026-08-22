# Path A — configure a node from an external MCP client

An external agent (Claude, Cursor, Grok) talks to **`http://127.0.0.1:8446/mcp`** after the operator opens an SSH tunnel. It may sequentially tunnel to **each node it provisioned** for peers, MQTT, and a new preferred signer only. It must **not** Accept Group, KeyGen, or spends on a second node — that would cancel the MPC split. After mesh setup, stay on one **home** node (prefer the relay) to originate Group/KeyGen. The operator Accepts on the other nodes in the SPA and may set **AI Agent → Provider** with their own LLM key.

**Published playbook (discover before or after connect):** `search_continuum_docs` → `get_continuum_doc` path `ContinuumDAO/MPAWallet/AgentProvision`. Humans: [Install a node](https://docs.continuumdao.org/ContinuumDAO/MPAWallet/Install). Oneshot flags: [CREATE_NODE_ONESHOT.md](https://github.com/ContinuumDAO/mpc-config/blob/main/docs/CREATE_NODE_ONESHOT.md).

Activate tool group **`node_config`** (`activate_tool_group`) for peer/relay write, MQTT TLS get/set, and the restart gate. Read peers with **`get_configured_node_keys`** (`node_info`).

## 0. Ask which topology before renting anything

Do not default to “rent two VPS from the same provider.”

**Recommend redundancy plus diversity** whenever the user will control more than one node (option A, and invitees in C):

- **Node redundancy:** prefer **2-of-3** (or higher `N` with `gate < N`) so one lost VPS does not freeze the wallet. 2/2 has no spare.
- **Different regions:** put nodes in distinct geographic regions (and AZs if the provider exposes them) so one outage or routing event does not hit the whole set.
- **Different VPS providers:** do not colocate the set on a single cloud. One provider ban, billing failure, or regional incident should not take every node offline.

The relay is still a single MQTT hub — say that clearly — but signing nodes should not share provider and region with each other (or with the relay, if they can avoid it).

| Option | Tell the user | Rent / oneshot | Then |
|--------|---------------|----------------|------|
| **A — Standalone set they control** | They run every signing node. Ask **how many can die** before the wallet is stuck. **Recommend 2-of-3**, split across **regions and providers**. | **N** Ubuntu/Debian VPS | Same relay (first slot) on every node. MQTT key from relay → others. Group + KeyGen with chosen **gate**. |
| **B — Join an established group** | Someone already has a relay. | **One** VPS | Prefer a **different region and provider** than the existing peers. Import **relay IP** + **MQTT TLS public key**. Do not invent a second relay. |
| **C — This node is the relay; invite others** | They host MQTT. | **One** VPS to start | `get_mqtt_tls_public_key` and share IP + PEM. Invitees run B; ask them to use other regions/providers. |

### Option A — 2/2 vs extra nodes for safety

| Sub-choice | Nodes (N) | KeyGen `gate` | If one node is lost |
|------------|-----------|---------------|---------------------|
| **2/2** | 2 | 2 | Cannot sign until that node is restored. Smallest pair only if they accept that risk. Still use **two providers / two regions**. |
| **Safer (recommend this)** | 3 | 2 (2-of-3) | The other two still reach gate 2. **Default ask.** Three VPS, three regions if possible, at least two providers. |
| **More slack** | 4+ | e.g. 2-of-4 or 3-of-5 | Can lose `N − gate` nodes. Keep spreading region and provider as N grows. |

`gate` is the signing threshold (`2 ≤ gate ≤ N`). Loss-safety requires **gate &lt; N**. Redundancy without diversity (three droplets in one region on one account) is a weak spare.

One installed node cannot finish a KeyGen alone. MQTT key is an **invite secret** (relay → peers), not a public paste. Every collaborator must use the **same first/relay IPv4**.

**VPS rental is out of scope.** Continuum does not buy machines. After the user picks a topology, tell them (or Claude with their cloud account) to rent the matching Ubuntu/Debian VPS count with public IPv4 and `ssh root@`, **not all from one panel**. x402 or any other pay-for-VM path is optional and external.

## 1. Credentials — two different moments

The oneshot installer (`install-node-debian-ubuntu.sh`) **must run as root on the VPS**. Typical: `ssh root@VPS` then paste curl|bash, or pipe the script over SSH.

| Secret | Oneshot | Path A MCP / later |
|--------|---------|--------------------|
| Root password or root SSH key | Needed if Claude or the user runs the oneshot as root | Do not keep in the agent after install |
| `mpcnode` login password | **Not set by oneshot** — emit `ssh root@IP 'passwd mpcnode'` next | User-only (SSH / SPA attach). Not needed for MCP |
| Bootstrap / `added_keys` | — | On the node bind-mount; MCP signs with it |
| LLM API key | — | User, **AI Agent → Provider** after attach |

Prefer: user runs oneshot, or Claude uses a **root SSH key**. Putting the root password in chat is last resort.

**Right after oneshot succeeds**, give a copy-paste password command. Oneshot creates `mpcnode` with `--disabled-password`; `ssh mpcnode@` will fail until they set one. They run this on **this PC**; `passwd` prompts twice. Do not collect the password in chat:

```bash
ssh root@YOUR_VPS_PUBLIC_IP 'passwd mpcnode'
```

After install, Claude does **not** need root or `mpcnode` to call MCP.

## 2. SSH tunnel (user-owned)

MCP HTTP has **no auth** — keep it on loopback.

**Give one copy-paste OpenSSH line** for the VPS you are on **now** (sequential: stop `-N`, new IPv4, same local **8446**). Do not remap ports unless the user asks. Same style as the SPA **Node hosted app (SSH tunnel)** box. Run on **this PC**, leave it open (`-N`). User **`mpcnode`**, not `root` — only after `passwd mpcnode` succeeded. The SPA’s three-port command (3333 / 8080 / 18080) does **not** forward MCP — Path A needs **8446**. Prefer all four forwards:

```bash
ssh -4 -N \
  -L 127.0.0.1:8446:127.0.0.1:8446 \
  -L 127.0.0.1:3333:127.0.0.1:3333 \
  -L 127.0.0.1:8080:127.0.0.1:8080 \
  -L 127.0.0.1:18080:127.0.0.1:18080 \
  mpcnode@YOUR_NODE_PUBLIC_IP
```

MCP-only: `ssh -4 -N -L 127.0.0.1:8446:127.0.0.1:8446 mpcnode@YOUR_NODE_PUBLIC_IP`. Do not bind `0.0.0.0`.

| Local port | Remote | Who |
|------------|--------|-----|
| **8446** | `continuum-mcp` `/mcp` | User opens; Claude uses |
| **3333** | node-app | User attach (hand-off) |
| **8080** | management HTTP | SPA attach |
| **18080** | public discovery | SPA attach |

Point the MCP client at `http://127.0.0.1:8446/mcp`. First node calls: `get_health` or `node_id`.

## 3. Peer / relay and MQTT tools

On **each node you provisioned**, one tunnel at a time (relay first):

1. `set_configured_nodes` with the same `peers: [relayIpv4, ...otherIpv4]`.
2. On the **relay**: `get_mqtt_tls_public_key`. On each other provisioned node: `set_mqtt_tls_key` with that PEM.
3. Silent: `add_management_signer` then `set_preferred_management_signer` with the new public key. Do not leave bootstrap as preferred.
4. `get_maintenance_restart_gate` (optional). Operator runs **`docker compose restart`** on that VPS. There is no MCP reboot tool.
5. `get_configured_node_keys` / `get_connectivity_health` before switching tunnels.

Do **not** `create_group_request`, `accept_group_request`, `create_key_gen_request`, or `accept_key_gen_request` except from the **home** node after mesh setup — and never Accept on a second node. Do not MCP nodes you did not provision.

`set_configured_nodes` writes `configs.yaml` via `POST /configUpdatePlan` + `POST /configUpdateImplement`. Changes apply after restart.

## 4. Topology playbooks (Path A MCP)

### A1 — 2/2 (only if they accept no spare node)

1. Oneshot on two VPS in **different regions**, ideally **different providers**. Sequential tunnels: peers + MQTT + new signer on **both**.
2. Stay on the **relay**. `get_connectivity_health`.
3. `create_group_request` / `create_key_gen_request` (`gate: 2`) from the relay only. User **Accepts** on the other node.

### A2 — 2-of-3 (recommended)

Same as A1 with **three** VPS — **different regions**, **at least two providers**. Sequential tunnels for peers/MQTT/signer on all three (`peers: [relay, a, b]`). Stay on the relay. Group all three IDs. KeyGen `gate: 2`. User Accepts on the other two.

### B — Join existing

1. Oneshot on one VPS. Prefer a **region and provider** the existing group does not already use.
2. Get **relay IPv4** and **MQTT PEM** from the existing operators.
3. `set_configured_nodes` with their full peer list (their relay first). `set_mqtt_tls_key`. Restart. Accept/create group as they instruct.

### C — Become relay and invite

1. Oneshot on one VPS. `set_configured_nodes` with at least `[thisPublicIpv4]` (add invitee IPs when known).
2. `get_mqtt_tls_public_key`. Give invitees: public IP, relay slot, PEM.
3. They run playbook B on VPS in **other regions / providers**. Add their IPs and restart when the list grows. Group/KeyGen only after enough healthy peers for the chosen gate. Prefer a 2-of-3+ gate so the mesh has node redundancy.

## 5. Hand-off to the user

Do **not** stop after peers / MQTT / restart and send them to the long docs. **Speak a short next-steps checklist.** After mesh setup, leave the tunnel on the **home** node (relay). Originate Group and KeyGen **there only**. The user Accepts on every other node in the SPA.

When `get_connectivity_health` is healthy on the home node:

0. Preferred signer is already done on each provisioned node in §3 (silent). If you skipped a node, do it before Group.
1. **Group** — `create_group_request` with the topology `node_id`s. You are auto-agreed. User **Accepts** on the other members (unanimous).
2. **KeyGen** — `create_key_gen_request` with the agreed **gate** (prefer 2-of-3). User Accepts on the other nodes. Confirm with `fetch_key_gen_result`.
3. **Register (preferred KeyGen)** — `post_preferred_key_gen` on the node they will compose from. UI: **AI Agent → Provider**. Without this, compose/agent has no default wallet.
4. **Attach** — `https://mpa.continuumdao.org` (tunnel **3333** if needed) so they can see Accept and the new address.
5. `mpcnode` password already set after oneshot; if not, `ssh root@IP 'passwd mpcnode'`.
6. Optional later: **AI Agent → Provider** LLM key (no MCP tool), chains, tokens.

## 6. Local PC later (Windows 11 / macOS) — not in this flow

Do **not** run the Debian oneshot on the user’s laptop. Humans install via **node map → your own PC**: Docker Desktop (WSL2 on Windows), Continuum extension, public WAN IPv4, router port-forward + DHCP MAC bind. Agents cannot reliably drive Docker Desktop GUI, router admin, or CGNAT. After a human-installed Desktop node exists, the same tunnel to **8446** + these tools still apply.
