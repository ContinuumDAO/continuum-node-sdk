# ContinuumDAO tokenomics

Built-in MCP on **continuum-mcp** at `/mcp/continuumdao-tokenomics`. Catalog id **`continuumdao-tokenomics`**. **`initialLoad: false`**. No API key.

Load per chat with **`agent_load_mcp_server({ serverId: "continuumdao-tokenomics" })`** only when the operator chooses ContinuumDAO tokenomics. Tools are **`continuumdao-tokenomics__*`**.

Live data comes from **`https://app-api.continuumdao.org`**. Protocol addresses from **`GET /protocol/*`** are canonical. Extra Linea contracts (NodeProperties, Rewards, treasury, MSAW) are read from **VotingEscrow** / **NodeProperties** on-chain — not from vectm config files.

## Circulating supply

`GET /metrics` **`circulatingSupply`** is unlocked CTM outside the Linea treasury:

`globalSupply − (CTM.balanceOf(veCTM) + CTM.balanceOf(Linea treasury))`

That is **not** the White Paper figure (“circulating, all locked in veCTM”). Do not mix the two. Max supply (100 million CTM) is documented, not returned by `/metrics`.

## Tools

1. **`get_ctm_metrics`** — escrowed, totalSupply, circulatingSupply, totalPower, holders, avgLockDuration
2. **`get_ctm_protocol_addresses`** — API + VotingEscrow-derived addresses with Etherscan / Lineascan **`explorerUrl`**
3. **`get_ve_ctm_position`** — wallet veNFTs (`address` required): **`VotingEscrow.locked(tokenId)`** amount + unlock time, `lockedTotal`, per-NFT voting power, address `getVotes` / delegates, last Governor `VoteCast`
4. **`get_ve_ctm_tokens`** — paginated or batched veNFTs; locked CTM and unlock from **`locked(tokenId)`**, plus owner voting power and last vote when readable
5. **`get_ve_ctm_locked_for_addresses`** — pass holder addresses (e.g. from etherscan **`get_token_top_holders`**) and get **`locked()`** CTM per address (not ERC-20 balance)
6. **`get_ctm_tokenomics_snapshot`** — metrics + addresses + allocation note (use **`search_continuum_docs`** for White Paper narrative)
7. **`list_ctm_onchain_followups`** — etherscan playbooks or how to enable them

Every tool includes **`onChainFollowUp`**. If official **`etherscan`** is not loaded, tell the operator that further tools (holders, treasury balances, ABI, veCTM logs) are available after **`add_mcp_server_from_catalog({ id: "etherscan" })`**, Variable **`ETHERSCAN_API_KEY`**, and **`agent_load_mcp_server({ serverId: "etherscan" })`**. Do **not** auto-load etherscan.

Not an OHLCV source — do not pass results to **`prepare_chart_from_rows`**.
