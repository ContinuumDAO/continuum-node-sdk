# Agent charts (`prepare_chart`)

Returns **`kind: continuum/chart/v1`** for the node agent chat UI (lightweight-charts). The UI renders this automatically when the agent calls **`prepare_chart`**.

## Workflow

1. Fetch OHLCV or price history (CoinGecko, Binance, protocol APIs, etc.) — any source.
2. Call **`prepare_chart`** with **`series`** (price/volume) and optional **`overlays`**.
3. **Main pane:** candles, volume, SMA, EMA, Bollinger, Fibonacci. **Oscillator panes (below):** RSI, MACD, Stochastic RSI — TradingView-style stacked sub-charts.

## Overlays (auto-computed)

Add **`overlays`** to compute indicators from a **`sourceSeriesId`** (candlestick or line closes).

| `type` | Pane | Params | Output |
|--------|------|--------|--------|
| `sma` | main | `period` (default **20**) | One overlay line |
| `ema` | main | `period` (default **20**) | One overlay line |
| `bollinger` | main | `period` (default **20**), `stdDev` (default **2**) | Upper, middle, lower lines |
| `fibonacci` | main | `range` **or** `sourceSeriesId`, optional `levels` | Horizontal retracement lines (default **all 7**) |
| `rsi` | **oscillator below** | `period` (default **14**) | RSI line (0–100 scale) |
| `macd` | **oscillator below** | `fastPeriod`, `slowPeriod`, `signalPeriod` (defaults 12/26/9) | MACD line, signal line, signed histogram |
| `stochasticrsi` | **oscillator below** | `rsiPeriod`, `stochasticPeriod`, `kPeriod`, `dPeriod` | %K and %D lines |

Each **`rsi` / `macd` / `stochasticrsi`** overlay gets its **own sub-pane** under the price chart. Time axes stay synced; the time scale is shown on the **bottom** pane only.

```json
{
  "title": "BTC — candles + SMA + EMA + Bollinger + Fib",
  "series": [
    {
      "id": "btc",
      "type": "candlestick",
      "label": "BTC/USDT",
      "data": [
        { "time": 1, "open": 100, "high": 102, "low": 98, "close": 101 },
        { "time": 2, "open": 101, "high": 103, "low": 100, "close": 102 },
        { "time": 3, "open": 102, "high": 105, "low": 101, "close": 104 }
      ]
    }
  ],
  "overlays": [
    { "type": "sma", "sourceSeriesId": "btc", "period": 2 },
    { "type": "ema", "sourceSeriesId": "btc", "period": 2 },
    { "type": "bollinger", "sourceSeriesId": "btc", "period": 2, "stdDev": 2 },
    {
      "type": "fibonacci",
      "sourceSeriesId": "btc",
      "trend": "up",
      "levels": [0, 0.382, 0.618, 1]
    }
  ]
}
```

Fibonacci with explicit range (lines span the chart time axis):

```json
{
  "overlays": [
    {
      "type": "fibonacci",
      "range": { "high": 105, "low": 98, "trend": "up" },
      "levels": [0, 0.5, 1]
    }
  ]
}
```

Prefer **`overlays`** over hand-built indicator lines when the user asks for moving averages, Bollinger bands, Fibonacci, RSI, MACD, or Stochastic RSI.

### Full example (price + RSI + MACD)

```json
{
  "title": "BTC analysis",
  "height": 420,
  "series": [
    {
      "id": "btc",
      "type": "candlestick",
      "label": "BTC/USDT",
      "data": [ "...40+ OHLC bars recommended for MACD/Stoch RSI..." ]
    }
  ],
  "overlays": [
    { "type": "ema", "sourceSeriesId": "btc", "period": 20 },
    { "type": "rsi", "sourceSeriesId": "btc", "period": 14 },
    { "type": "macd", "sourceSeriesId": "btc" },
    { "type": "stochasticrsi", "sourceSeriesId": "btc" }
  ]
}
```

## Series types

| `type` | `data` fields |
|--------|----------------|
| `candlestick` | `time`, `open`, `high`, `low`, `close` |
| `line` / `area` | `time`, `value` |
| `histogram` | `time`, `value`, optional `color` or auto **`direction`** (`up`/`down`) from paired candlesticks |

## Volume bars (histogram)

When a **`candlestick`** series is present, **`histogram`** volume bars are colored **green/red** from **open vs close on the same bar time** (works for 1m, 1h, 1d, or any aligned period — not calendar-day logic). Enabled by default via **`options.colorVolumeFromCandles`** (default `true`). Override with per-bar **`color`**, or set **`options.colorVolumeFromCandles: false`**.

```json
{
  "title": "BTC 1h + volume",
  "series": [
    {
      "id": "btc",
      "type": "candlestick",
      "label": "BTC/USDT",
      "data": [
        { "time": 1735689600, "open": 100, "high": 110, "low": 90, "close": 105 },
        { "time": 1735693200, "open": 105, "high": 108, "low": 99, "close": 101 }
      ]
    },
    {
      "id": "vol",
      "type": "histogram",
      "label": "Volume",
      "priceScaleId": "left",
      "data": [
        { "time": 1735689600, "value": 1200 },
        { "time": 1735693200, "value": 980 }
      ]
    }
  ]
}
```

First bar: close ≥ open → green volume. Second: close < open → red volume.

## Time formats

- Unix **seconds** (recommended): `1735689600`
- Unix **milliseconds**: auto-converted
- Date string: `"2026-01-15"` (daily)

## Multi-series example (candles + SMA)

```json
{
  "title": "ETH/USDT — 1h + SMA(20)",
  "height": 280,
  "series": [
    {
      "id": "eth",
      "type": "candlestick",
      "label": "ETH/USDT",
      "data": [
        { "time": 1735689600, "open": 3400, "high": 3450, "low": 3380, "close": 3420 }
      ]
    },
    {
      "id": "sma20",
      "type": "line",
      "label": "SMA(20)",
      "overlay": true,
      "style": { "color": "#FF6D00", "lineWidth": 2, "lineStyle": "dashed" },
      "data": [{ "time": 1735689600, "value": 3410 }]
    }
  ]
}
```

## Options

- **`options.maxPoints`** — cap per series (default **5000**); keeps newest points when trimming.
- **`options.colorVolumeFromCandles`** — color histogram bars from candlestick open/close at the same timestamp (default **true**).
- **`priceScaleId`**: `"left"` | `"right"` — use different scales for unlike units.
- **`overlay`**: `true` — draw line/area on the main price pane.

When the user asks to graph, plot, or chart data, call **`prepare_chart`** after assembling series — do not rely on markdown tables alone.

## KeyGen orchestration (sub-agents)

Charts for the **KeyGen group** must not be pasted into `send_key_gen_message` bodies (64 KiB limit; chart JSON is often much larger).

1. **`prepare_chart`** → `continuum/chart/v1` envelope.
2. **`post_key_gen_chart_attachment`** → upload JSON bytes; receive `attachmentId` + `sha256`.
3. **`send_key_gen_message`** reply with `mpc-task-result v1` and `charts[].attachmentId` refs only.

Optional **inline** ` ```continuum/chart/v1` fence for tiny charts when upload fails.
