# Technical indicators (opt-in MCP)

Catalog id **`technical-indicators`**: HTTP endpoint on **continuum-mcp** (`/mcp/ta`), **`initialLoad: false`** by default.

**Agent chat:** activating this server in the UI does not expose tools until **Initial load** is enabled and you start a **new chat**, or the agent calls **`agent_load_mcp_server`** with `serverId: "technical-indicators"`. Tools are prefixed **`technical-indicators__`** (e.g. **`technical-indicators__calculate_technical_indicator`**).

Tools wrapping [fast-technical-indicators](https://www.npmjs.com/package/fast-technical-indicators). Call **`list_technical_indicators`** first to see required input profiles, then **`calculate_technical_indicator`**.

## Input profiles

| Profile | Provide in `input` |
|---------|-------------------|
| `close_series` | `values` or `close`, or `candles[]` (close extracted) |
| `ohl_series` | `high`, `low` |
| `ohlc_series` | `high`, `low`, `close` |
| `hlcv_series` | `high`, `low`, `close`, `volume` |
| `ohlcv_series` | `open`, `high`, `low`, `close`, `volume` |
| `close_volume_series` | `close` (or `values`), `volume` |
| `candle_objects` | `candles[]` with `{ open, high, low, close, volume? }` |
| `range_scalar` | `range: { high, low, trend? }` |
| `dual_series` | `valuesA`, `valuesB` |
| `special` | `renko`: `candles[]` + `params.brickSize`; `fibonacciProjection`: `values`/`close` + `swingPoints` |

All array fields must have equal length where applicable. Max series length defaults to **50_000** (`TA_MCP_MAX_SERIES_LENGTH`).

## Warmup

Many indicators return `undefined` for initial bars until enough history exists. The response includes **`warmupCount`**. Set **`options.trimWarmup: true`** to drop leading empty slots from **`result`**.

## Examples

### SMA (close series)

```json
{
  "indicator": "sma",
  "params": { "period": 3 },
  "input": { "values": [1, 2, 3, 4, 5] },
  "options": { "trimWarmup": true }
}
```

### Stochastic (OHLC)

```json
{
  "indicator": "stochastic",
  "params": { "period": 14, "signalPeriod": 3 },
  "input": {
    "high": [48.7, 48.9, 49.0],
    "low": [47.8, 48.1, 48.2],
    "close": [48.2, 48.6, 48.8]
  }
}
```

### MACD (objects output)

```json
{
  "indicator": "macd",
  "input": { "values": [44, 44.5, 45, 44.8, 45.2] }
}
```

### Fibonacci retracement (levels)

```json
{
  "indicator": "fibonacci",
  "input": { "range": { "high": 100, "low": 80, "trend": "up" } }
}
```

### Doji pattern (booleans)

```json
{
  "indicator": "doji",
  "input": {
    "candles": [
      { "open": 10, "high": 11, "low": 9, "close": 10.05 }
    ]
  }
}
```

## Aliases

Some indicators accept alternate names (e.g. `ichimokucloud` → `ichimokukinkouhyou`, `keltnerchannels` → `keltnerchannel`, `fibonacciretracement` → `fibonacci`). The response **`indicator`** field always uses the canonical id.
