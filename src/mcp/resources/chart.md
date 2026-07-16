# Agent charts (`prepare_chart` / `prepare_chart_from_rows`)

Returns **`kind: continuum/chart/v1`** for agent chat, KeyGen attachments, and DeFi UIs (lightweight-charts).

## Workflow

1. **Fetch OHLCV** with a source the **operator chose** (CoinGecko, CoinMarketCap, `ctm_*_fetch_ohlcv`, exchange APIs, subgraphs, etc.). Never auto-load catalog MCP servers.
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
| GMX `fetch_ohlcv` | `timestampMs` | strings (no volume on row); top-level `{ symbol, timeframe, candles }` |
| Binance `get_klines` (JSON) | `openTime` (ms) | strings → coerced |
| Bybit `getMarketKline` | tuple `[startTime, …]` or `{ startTime, open, … }` | strings → coerced |
| Bitget REST / MCP | tuple `[ts, o,h,l,c,vol,…]` or `{ timestamp, … }` | strings → coerced |
| CoinMarketCap keyless (`get_kline_candles`) | `time` (Unix **seconds**) | numbers; `{ candles: [...] }` wrapper |
| CoinMarketCap OHLCV API | `{ time_open, quote: { USD: { … } } }` | numbers; nested `quote` flattened |
| Uniswap V4 `fetch_ohlcv` (`ctm_uniswap_v4_fetch_ohlcv`) | `timestampMs` | strings → coerced; `{ symbol, timeframe, candles }` flat envelope |
| Uniswap subgraph (`PoolHourData` / `PoolDayData`) | `periodStartUnix` | `open`/`high`/`low`/`close`, optional `volumeUSD` (legacy manual subgraph rows) |

### Generic OHLCV engine (adding a new source)

SDK charting is **vendor-agnostic** after fetch:

1. **`extractOhlcvBarsFromUnknown`** — pulls a bar array from any MCP/tool JSON (nested wrappers, stringified JSON, `{ prices, total_volumes }` spot series). Walks unknown wrapper keys up to depth 6; prefers known keys (`result`, `candles`, `ohlcv`, `klines`, …).
2. **`normalizeCandleRow`** (`point-normalize.ts`) — single source of truth per bar: time fields (`time`, `timestampMs`, `timestamp`, `openTime`, `t`, `periodStartUnix`, …), OHLC aliases (`o`/`h`/`l`/`c`, `price_*`), nested CMC `quote.USD`, numeric strings → numbers, ms → sec.
3. **`prepare_chart_from_rows`** / **`prepareChart`** — sort, dedupe, optional display cap via `maxPoints` (does **not** require pre-trimming fetch candles), optional volume histogram (only when volume present), default EMA/RSI overlays.

**Volume optional:** rows without `volume` / `v` / tuple index 5 chart as **candles only** (warning in `meta.warnings`; volume pane omitted). GMX is an example.

**New fetch tool checklist:**

- Return bars as an array of objects or OHLC tuples, anywhere in the JSON tree (or add a known wrapper key to `NESTED_BAR_KEYS` in `fetch-result.ts` if you want it prioritized).
- Prefer `{ title, label, …bars… }` on the fetch payload for chart titles; otherwise `extractChartMetadataFromFetchPayload` infers from common DeFi shapes.
- Add one **`extractOhlcvBarsFromUnknown` + `prepareChartFromRows`** test with a sample row from your API.
- Optional: extend **`mapOhlcFieldAliases`** / **`flattenVendorCandleRow`** in `point-normalize.ts` only when the row shape is genuinely new (not covered by existing time/OHLC fields).

- **`ctm_uniswap_v4_fetch_ohlcv`** returns `{ symbol, timeframe, chainId, candles, dataSource, … }` — pass full tool result to **`prepare_chart_from_rows`**. Other **`ctm_uniswap_v4_*`** tools (quote/swap/LP) do not return candles.
- Times in **milliseconds** (>1e12) are converted to **seconds** automatically.
- **`open` / `high` / `low` / `close` / `volume`** may be numbers or numeric strings.
- **Tuple rows** (Binance/Bybit/Bitget native arrays) may be passed directly in **`series[].data`**.
- Pass **`ohlcv.candles`** / **`klines`** / **`result.list`** as a flat **`data`** array — not the whole API wrapper as **`series`**.
- Binance MCP defaults to markdown; use **`response_format: "json"`** and map **`klines`** into **`series[0].data`**.
- CMC **`coinmarketcap-public__get_kline_candles`** returns **`candles`** with `time`/`open`/`high`/`low`/`close`/`volume` — pass the full tool result object to **`prepare_chart_from_rows`** (not a JSON string). Use **`lookbackDays`** or **`from`/`to`** so the fetch covers the requested window; `limit` alone without time bounds used to return oldest bars.
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

### `prepare_chart_from_rows` + fetch `toolResult` (Hyperliquid, GMX, CoinGecko, CMC)

**Do not trim or slice candles before this call.** Pass the **full, unmodified** fetch JSON as `toolResult`. The chart layer downsamples for **display** via `options.maxPoints` (default 400) — that is not the same as deleting history from the fetch.

| Operator request | Typical bars | Action |
|------------------|--------------|--------|
| ETH-PERP **1H — last 7d** | ~168–169 | Pass full `toolResult`; title `ETH-PERP 1H — last 7d` |
| ETH-PERP **1H — last 30d** | ~721 | Pass full `toolResult`; title `ETH-PERP 1H — last 30d` — **do not** switch to 1D |
| **4H — last 30d** | ~181 | Pass full `toolResult` |
| **15m — last 24h** | ~96 | Pass full `toolResult` |

- **Never** shorten the window or switch to a **coarser interval** because you think the payload is too large — there is no chart-builder bar-count limit for normal fetch windows.
- If `prepare_chart_from_rows` fails, quote the tool **`reason`** exactly — do not invent payload or metadata errors.
- Match **`title`** interval + lookback to the fetch. **`meta.windowExpectation`** and **`meta.loadStatus`** reflect what was loaded vs displayed.

When the operator **does not** specify a range, choose a sensible fetch window from the bar interval (table below) and put it in **`title`**.

### Default lookback (operator did not specify a range)

| Bar interval | Default calendar window | Approx. bars |
|--------------|-------------------------|--------------|
| 1m – 5m | 1 – 3 days | 300 – 500 |
| 15m | 5 – 10 days | 300 – 500 |
| 1h | 7 – 30 days | 168 – 720 |
| 4h | 30 – 90 days | 180 – 540 |
| 1d | 6 – 12 months | 180 – 365 |
| 1w | 2 – 3 years | 100 – 150 |

Put the chosen window in **`title`** (e.g. `BTC/USD 4H — last 90d`) so the operator knows what they are seeing.

### When the operator specifies a period

Honor their range exactly (e.g. “7 days on 1h” ≈ 168 bars). Fetch that window, pass the **full** `toolResult`, and chart it — do **not** substitute a shorter window or coarser interval.

### Bar budget — **`prepare_chart` only** (manual series assembly)

These limits apply when you build **`series[].data`** yourself for **`prepare_chart`**, not when using **`prepare_chart_from_rows`** with a vendor fetch `toolResult`:

- Aim for **≤ ~400 bars** per series when hand-assembling data.
- Set **`options.maxPoints`: 400** as a display cap; the tool keeps the **newest** points when trimming (never the oldest).

```javascript
bars.sort((a, b) => a.time - b.time);
bars = bars.slice(-maxBars); // manual prepare_chart only; never slice fetch toolResult
```

### Fetch strategy (before charting)

1. Request the interval and lookback the operator asked for (or the default window above).
2. Pass the complete fetch result to **`prepare_chart_from_rows`** — do not pre-trim candles for MCP context size.
3. Use **`overlays`** for SMA / RSI / MACD — do not hand-build indicator series unless necessary.
4. For KeyGen attachments (larger payloads allowed), you may use more bars in manual **`prepare_chart`** series.

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

When the user asks to graph, plot, or chart data, call **`prepare_chart_from_rows`** (or **`prepare_chart`**) after assembling series — do not rely on markdown tables alone.

**Where charts appear:** the node app renders charts under the **MCP result** row for `prepare_chart` / `prepare_chart_from_rows`, not inside the assistant text bubble. A prose reply like “chart prepared” without a successful chart tool result means nothing was rendered.

**Hyperliquid / DeFi `fetch_ohlcv`:** returns `{ ohlcv: { coin, interval, candles: [...] } }` (full candles in **`structuredContent`**; agent text is a **slim** view with **`meta.ohlcvSummary`** and **`meta.sessionBind`**). After `fetch_ohlcv`, call `prepare_chart_from_rows` with the **full fetch object** as `toolResult` once, plus a descriptive `title` (interval + lookback, e.g. `ETH-PERP 1H — last 7d`), or `{ title, ohlcvDigest }` when the fetch is already bound. Follow-up chart/analyze/apply calls use **`{ title, ohlcvDigest }`** only — do not re-paste candle JSON.

**Load-only / cron prefetch:** summarize **`meta.ohlcvSummary`** from the fetch tool and **stop** — do not call `prepare_chart_from_rows` unless the operator asked to chart. See **`chart_analysis_docs`** § “Load data only”.

**OHLCV integrity:** `prepare_chart_from_rows` hard-fails hand-copied `rows` without fetch `toolResult`, invalid OHLC structure, stale-body composite bars, and **title interval ≠ fetch interval** (e.g. title `1H` with fetch `12h`). On failure, re-fetch at the **requested** interval — do not switch to a coarser timeframe or retry prepare in a loop (that burns tool rounds).

**Never truncate OHLCV for the MCP context window.** Pass the complete fetch `toolResult` unchanged — the chart layer downsamples for display (`maxPoints`). Match **`title`** interval and lookback to fetch params (e.g. `15m — last 24h`, `4H — last 30d`, `1H — last 7d`). The SDK validates **`meta.windowExpectation`** for any interval × lookback; mismatches **hard fail** — re-fetch at the **requested** interval only, never a coarser substitute.

## Live updates (agent chat + DeFi dialogs)

When `prepare_chart_from_rows` receives a fetch payload the SDK recognizes (Hyperliquid `ohlcv`, Lighter `ohlcv` with `dataSource: "lighter"`, GMX flat `{ symbol, timeframe, candles }`, CoinGecko market chart), the output may include optional **`live`**:

```json
{
  "kind": "continuum/chart/v1",
  "chart": { "...": "..." },
  "live": {
    "providerId": "hyperliquid.allMids",
    "bucketSec": 3600,
    "pollMs": 4000,
    "maxPoints": 400,
    "params": { "coin": "ETH", "interval": "1h" }
  }
}
```

The node app polls a **tick adapter** registered for `providerId` every `pollMs` (default **4000**). Each tick is `{ timeMs, price, volume? }`. The SDK merges it into the last OHLCV bar (or appends on bucket rollover) and recomputes overlays locally — **no full OHLCV refetch** on each poll.

| `providerId` | Tick source |
|--------------|-------------|
| `hyperliquid.allMids` | Hyperliquid `allMids` for `params.coin` |
| `lighter.marketSnapshot` | Lighter market snapshot mid for `params.symbol` (optional `params.chainId`, `params.marketId`) |
| `gmx.markPrice` | GMX index mark USD for `params.symbol` |
| `coingecko.simple` | CoinGecko simple price for `params.coinId` |

**Static charts:** KeyGen chart attachments and charts without `live` are never polled. **`prepare_chart`** alone does not attach `live` — pass the original fetch JSON via **`prepare_chart_from_rows`** (`toolResult`) so binding can be inferred.

**Agent load status:** Successful `prepare_chart_from_rows` / `apply_chart_*` responses may include **`meta.loadStatus`**, **`meta.ohlcvSummary`**, **`meta.dataPolicy`**, and **`meta.warnings`**. Read these before telling the operator the chart is complete or that live price is working:

| Field | Meaning |
|-------|---------|
| `meta.ohlcvSummary.high` / `.low` / `.lastClose` | **Only** prices to quote for “period high”, “latest close”, etc. — never invent |
| `meta.dataPolicy` | Restated rule: no invented OHLCV |
| `loadStatus.dataComplete` | Historical OHLCV matches fetch metadata (bar count, gaps, window) |
| `loadStatus.dataIssues` | Incomplete historical data — **independent of live price** |
| `loadStatus.liveReady` | Live tick merge likely to work |
| `loadStatus.liveBindingAttached` | `live` binding is on the chart payload |
| `loadStatus.liveIssues` | Live price may be unavailable in the UI |

**Data not fully loaded:** `meta.warnings` tells the agent not to treat the chart as complete. Ask the operator whether to **re-run the OHLCV fetch** or **switch data source** (provider, symbol, interval, lookback).

**Live price (when `live` is attached or expected):** Do **not** claim live updates are active unless the chart header confirms it. If live price is unavailable in the UI, ask whether to re-fetch, try another provider, or use the static chart only.

## Customization (plotting — agent-driven)

For **analysis without a chart**, use **`chart_analysis_docs`** and **`list_chart_analysis_options`** — not this section.

**Analysis after plotting:** a visible chart does **not** replace **`analyze_*`**. For interpret/pattern/momentum/levels requests, call **`list_chart_analysis_options`** or the matching **`analyze_*`** on the same OHLCV session — never prose-only analysis invented from the rendered chart.

Use **`list_chart_customization_options`** to discover overlay types, drawing tools, and styling knobs before changing a chart. There is no UI picker — the agent chooses from the catalog and re-prepares.

**Typical workflow:**

1. **`list_chart_customization_options`** — read available indicators, pane layout rules, drawing types.
2. **`prepare_chart` / `prepare_chart_from_rows`** with explicit **`overlays`** (replace defaults) or **`options.skipDefaultOverlays`: true**.
3. **Drawing tools** — compute levels, then apply:
   - **`calculate_key_levels`** — swing support/resistance from recent bars
   - **`calculate_pivot_points`** — classic pivot levels for a session
   - **`calculate_fibonacci_range`** — retracement levels between swing high/low (0.618 highlighted by default)
   - **`calculate_trend_lines`** — diagonal support/resistance from swing pivot pairs
   - **`calculate_chart_pattern_drawings`** — classic pattern geometry (optional if `apply_chart_pattern_drawings` receives `analysis` / `patternId`)
   - **`apply_chart_drawings`** — merge computed levels into the chart via **`drawings`** / **`prepareReplay`**
   - **`apply_chart_pattern_drawings`** — merge classic pattern overlays (trend boundaries, necklines) onto an existing chart

### Adding drawings to an existing chart (do not re-fetch)

When the operator already has a chart on screen and asks to **show trend lines**, **add Fibonacci**, **draw support/resistance**, etc.:

1. **Do not call CoinGecko / OHLCV fetch again** unless they explicitly change symbol, interval, or lookback.
2. **`calculate_trend_lines`** (or other `calculate_*` drawing tool) with **`{ title, ohlcvDigest }`** from `meta.sessionBind` — or the full fetch object on the first call only.
3. **`apply_chart_drawings`** or **`apply_chart_pattern_drawings`** with geometry from step 2 (or **`patternNumber`** / `patternId` for patterns), plus **`prepareReplay`** from the prior **`prepare_chart_from_rows`** output when available. Pass the same **`toolResult`** so bar count and lookback stay identical.

**Prose-only replies are wrong** when the operator asked to **draw** or **show on the chart** — use **`apply_chart_drawings`** / **`apply_chart_pattern_drawings`**, not a new **`prepare_chart_from_rows`** with a different window. For classic patterns after **`analyze_chart_patterns`**, pass **`patternNumber`** (menu #1 → `patternNumber: 1`) — do not describe overlays in chat without calling the apply tool.

**Live refresh:** When `live` is set, the node replays **`prepareReplay`** on each tick so custom overlays and drawings survive 4s updates. Default EMA/RSI are snapshotted into `prepareReplay.overlays` when they were applied implicitly.

**Day high/low:** The chart UI shows UTC calendar-day high and low above the title (day of the latest bar).

## KeyGen orchestration (sub-agents)

Charts for the **KeyGen group** must not be pasted into `send_key_gen_message` bodies (64 KiB limit; chart JSON is often much larger).

1. **`prepare_chart`** → `continuum/chart/v1` envelope.
2. **`post_key_gen_chart_attachment`** → upload JSON bytes; receive `attachmentId` + `sha256`.
3. **`send_key_gen_message`** reply with `mpc-task-result v1` and `charts[].attachmentId` refs only.

Optional **inline** ` ```continuum/chart/v1` fence for tiny charts when upload fails.
