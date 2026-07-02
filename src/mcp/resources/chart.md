# Agent charts (`prepare_chart` / `prepare_chart_from_rows`)

Returns **`kind: continuum/chart/v1`** for agent chat, KeyGen attachments, and DeFi UIs (lightweight-charts).

## Workflow

1. **Fetch OHLCV** with any supported source (CoinGecko, `ctm_*_fetch_ohlcv`, exchange APIs, subgraphs, etc.).
2. **`prepare_chart_from_rows`** — preferred for a single feed: pass **`rows`** (bar array) or **`toolResult`** (full prior MCP JSON). Never `{}`.
3. **`prepare_chart`** — advanced: multi-series, custom overlays, or shorthand **`bars`** / **`toolResult`**.

**Main pane:** candles, SMA, EMA, Bollinger, Fibonacci. **Volume pane (below price):** when volume on rows. **Oscillator panes:** RSI, MACD, Stochastic RSI.

See **Lookback & bar budget** below. Optional skills **`chart-periods`**, **`chart-defaults`** (`initialLoad: true`).

## Candle row shapes (per-point normalization)

Each object in **`series[].data`** is normalized before charting. **`prepare_chart`** accepts common OHLCV vendor shapes:

| Source | Time field | OHLC / volume types |
|--------|------------|---------------------|
| CoinGecko / agent | `time` (Unix **seconds**) | numbers |
| Hyperliquid `fetch_ohlcv` | `timestampMs` | strings → coerced |
| GMX `fetch_ohlcv` | `timestampMs` | strings (no volume on row) |
| Binance `get_klines` (JSON) | `openTime` (ms) | strings → coerced |
| Bybit `getMarketKline` | tuple `[startTime, …]` or `{ startTime, open, … }` | strings → coerced |
| Bitget REST / MCP | tuple `[ts, o,h,l,c,vol,…]` or `{ timestamp, … }` | strings → coerced |
| CoinMarketCap OHLCV API | `{ time_open, quote: { USD: { … } } }` | numbers; nested `quote` flattened |
| Uniswap subgraph (`PoolHourData` / `PoolDayData`) | `periodStartUnix` | `open`/`high`/`low`/`close`, optional `volumeUSD` |

- **`ctm_uniswap_v4_*`** MCP tools do **not** return candles — only quotes, swaps, and LP. Pool OHLCV comes from a **subgraph** or third-party indexer; map `poolHourDatas` into **`series[0].data`**.
- Times in **milliseconds** (>1e12) are converted to **seconds** automatically.
- **`open` / `high` / `low` / `close` / `volume`** may be numbers or numeric strings.
- **Tuple rows** (Binance/Bybit/Bitget native arrays) may be passed directly in **`series[].data`**.
- Pass **`ohlcv.candles`** / **`klines`** / **`result.list`** as a flat **`data`** array — not the whole API wrapper as **`series`**.
- Binance MCP defaults to markdown; use **`response_format: "json"`** and map **`klines`** into **`series[0].data`**.
- CMC MCP exposes quotes/TA tools; raw OHLCV candles come from **`/v2/cryptocurrency/ohlcv/historical`** (Pro API) or flatten **`quotes[]`** into **`data`**.
## Default indicators (candlestick)

When **`prepare_chart`** receives a **candlestick** series and **no `overlays`**, the tool automatically adds:

| Pane | Indicator | Default |
|------|-----------|---------|
| Main (price) | **EMA** | period **50** |
| Below price | **Volume** histogram | when volume exists on candle rows |
| Below volume | **RSI** | period **14** |

- Pass a non-empty **`overlays`** array to **replace** these defaults entirely (e.g. SMA 20 only).
- Set **`options.skipDefaultOverlays`: true** to show candles (+ volume) only.
- Defaults apply only when there are enough bars (≥ **50** for EMA, > **14** for RSI); shorter series chart as candles only.
- **`prepare_chart` computes overlays internally** — you do **not** need the **`technical-indicators`** MCP server for default EMA/RSI. Load **`technical-indicators`** for standalone `calculate_technical_indicator` calls or catalog exploration (see skill **`chart-defaults`**).

Operator-specific overrides (different EMA period, add MACD, disable RSI): edit node skill **`chart-defaults`** or pass explicit **`overlays`** / **`skipDefaultOverlays`** in the tool call.

## Lookback & bar budget

When the operator asks to chart something but **does not specify how far back** to look, choose a sensible window from the **bar interval** (or from their stated period). Target **~150–400 bars** on screen for agent chat — enough context without clutter or oversized payloads.

### Default lookback (operator did not specify a range)

| Bar interval | Default calendar window | Approx. bars |
|--------------|-------------------------|--------------|
| 1m – 5m | 1 – 3 days | 300 – 500 |
| 15m | 5 – 10 days | 300 – 500 |
| 1h | 30 – 60 days | 720 – 1 440 (trim below) |
| 4h | 60 – 90 days | 360 – 540 |
| 1d | 6 – 12 months | 180 – 365 |
| 1w | 2 – 3 years | 100 – 150 |

Put the chosen window in **`title`** (e.g. `BTC/USD 4H — last 90d`) so the operator knows what they are seeing.

### When the operator specifies a period

Honor their range (e.g. “6 months on 4h” ≈ 1 080 bars). Still apply the **bar budget** and **newest-first trim** below if the result exceeds chat limits.

### Bar budget (agent chat)

- Aim for **≤ ~400 bars** in each series passed to **`prepare_chart`**.
- Set **`options.maxPoints`: 400** (or lower) as a safety net. The tool keeps the **newest** points when trimming (never the oldest).
- **`prepare_chart` does not fix oversized fetch payloads** — trim **before** the call when you aggregate or download more data than needed.

### Newest data wins (always)

Sort ascending by `time`, then keep the tail:

```javascript
bars.sort((a, b) => a.time - b.time);
bars = bars.slice(-maxBars); // maxBars ≤ 400 for chat; use operator range when smaller
```

Apply the same tail slice to volume / indicator inputs aligned on those times. Do **not** pass the oldest segment of a long download.

### Fetch strategy

1. Request the **coarsest API resolution** that matches the target interval (avoid 30 days of 1h ticks when you only need 4h bars).
2. **Aggregate** (e.g. hourly → 4h) then **trim** with `slice(-maxBars)`.
3. Pass trimmed, ascending OHLCV to **`prepare_chart`**; use **`overlays`** for SMA / RSI / MACD — do not hand-build indicator series unless necessary.
4. For KeyGen attachments (larger payloads allowed), you may use more bars; still prefer newest-first trim.

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

- **`options.maxPoints`** — cap per series (default **5000**); keeps **newest** points when trimming. Use **400** (or similar) for agent chat unless the operator needs a longer on-screen history.
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
