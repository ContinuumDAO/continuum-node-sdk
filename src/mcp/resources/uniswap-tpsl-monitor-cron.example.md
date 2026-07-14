# Uniswap TP/SL monitor cron template

Copy into an agent cron job `message` body (or use MCP tool `register_uniswap_tpsl_monitor_cron`).

```yaml
tradeTpslMonitor:
  protocolId: uniswap
  chainId: 1
  tradeIdeaId: "<trade-idea-uuid>"
  tradeIdeaNumber: 1
  sizeUsdHuman: "500"
  side: long
  pollEveryMinutes: 5
  takeProfitPriceHuman: "3500"
  stopLossPriceHuman: "3200"
  keyGenId: "<keygen-id>"
```

## Behavior

- Polls pool price (The Graph on most chains; **Bitquery on Robinhood 4663** with `BITQUERY_API_KEY`).
- On TP or SL cross: triggers **market swap** exit via `build_trade_from_trade_idea` (`orderKind: market`).
- Not on-chain resting orders — requires cron/agent to stay active.

## Disable

Call `deactivate_cron_job` when the position is closed or the monitor is no longer needed.
