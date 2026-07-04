# Chart analysis (data only — no chart envelope)

Structured OHLCV analysis for agent chat and orchestration. **Does not render charts.**

For plotting and on-chart drawings, see **`chart_docs`** (`chart.md`).

## Analysis vs plotting

| Lane | Discovery | Tools | Output |
|------|-----------|-------|--------|
| **Analysis** | `list_chart_analysis_options` | `analyze_*` | JSON `{ analysis, meta }` |
| **Plotting** | `list_chart_customization_options` | `prepare_chart*`, `calculate_*`, `apply_chart_drawings` | `continuum/chart/v1` |

**Do not call `prepare_chart*` or `apply_chart_drawings` for analysis-only requests.**

**Do not call `analyze_*` when the operator only asked to plot or draw on a chart** — use the plotting lane instead.

## Vague analysis requests → text menu

When the operator says **interpret**, **analyze**, **what does it mean**, **outlook**, etc. **without** naming a specific analysis type:

1. Call **`list_chart_analysis_options`**.
2. Reply with a **numbered text menu** from the catalog (label + one-line description per type).
3. Ask the operator to pick a number or name.
4. On selection: fetch OHLCV (if needed) → call **one** `analyze_*` → summarize from the tool JSON.

**Never** auto-run trend line analysis or replot a chart for vague “interpret” / “analyze” prompts.

When the operator names a type (e.g. “run momentum analysis”), skip the menu and call the matching `analyze_*` directly.

Optional: load skill **`chart-analysis-menu`** (initialLoad) or per-type skills (`chart-analysis-trend`, etc.) for narrative templates.

## Analysis tools

All accept **`toolResult`** or **`rows`**. Optional **`title`** for `meta`.

### OHLCV analyses (`dataKind`: `ohlcv`)

Requires candle rows (open/high/low/close). Use after OHLCV fetch tools.

| Tool | Returns |
|------|---------|
| **`analyze_trend_structure`** | Bias, swing high/low, HH/HL/range structure, time phases, trend-line scores |
| **`analyze_key_levels`** | Ranked supports/resistances, nearest levels vs last close |
| **`analyze_momentum`** | RSI zone, MACD values, crossover state |
| **`analyze_range_volatility`** | Range %, ATR-style stats, compression vs expansion, Fib swing range |
| **`analyze_candlestick_patterns`** | Detected pattern **name** + **description**, buy/sell/hold, confidence, rationale |

**`analyze_candlestick_patterns`** requires at least **14** OHLCV bars (TA-Lib lookback). Optional: `patterns[]` filter, `focusBar` (default last bar), `minConfidence` (0–1). Standalone candlestick hit rates are ~50–55%; use with trend context.

Example:

```json
{
  "title": "BTC 1d",
  "toolResult": { "... prior OHLCV fetch ..." },
  "patterns": ["hammer", "doji", "engulfing"],
  "focusBar": "last"
}
```

Response includes `analysis.patterns[]` with `name`, `description`, `direction`, `confidence`, plus `primaryPattern`, `recommendation`, `recommendationConfidence`, and `rationale`.

Detection uses a **pure TypeScript port of TA-Lib CDL** logic (`src/core/candlestick-patterns/`). It is separate from the optional **`technical-indicators`** MCP (`fast-technical-indicators`).

#### Supported patterns (18)

Filter with `patterns: ["hammer", "doji", …]` using the **id** column. Bias: **bullish** / **bearish** / **neutral** (indecision) / **signal** (direction from candle color or engulfing sign).

**Single-bar indecision**

| id | Name | Description |
|----|------|-------------|
| `doji` | Doji | Open and close are nearly equal, showing indecision; the market may pause or reverse. |
| `spinning_top` | Spinning Top | Small body with upper and lower shadows longer than the body; signals indecision between buyers and sellers. |
| `long_legged_doji` | Long-Legged Doji | Doji with long upper and/or lower shadows; extreme indecision and potential turning point. |
| `dragonfly_doji` | Dragonfly Doji | Doji with open/close at the high and a long lower shadow; often bullish after a selloff. |
| `gravestone_doji` | Gravestone Doji | Doji with open/close at the low and a long upper shadow; often bearish after a rally. |

**Single-bar reversal / conviction**

| id | Name | Bias | Description |
|----|------|------|-------------|
| `hammer` | Hammer | bullish | Small body at the top of the range with a long lower shadow; often interpreted as bullish reversal after a decline. |
| `hanging_man` | Hanging Man | bearish | Hammer-shaped candle appearing after an advance; often interpreted as bearish reversal at highs. |
| `shooting_star` | Shooting Star | bearish | Small body near the low with a long upper shadow after a gap up; bearish reversal signal at resistance. |
| `inverted_hammer` | Inverted Hammer | bullish | Small body near the low with a long upper shadow after a gap down; potential bullish reversal. |
| `marubozu` | Marubozu | signal | Long body with very little or no shadows; strong directional conviction from open to close. |

**Two-bar**

| id | Name | Bias | Description |
|----|------|------|-------------|
| `engulfing` | Engulfing | signal | Second candle body fully engulfs the prior body with opposite color; strong two-bar reversal signal. |
| `harami` | Harami | signal | Small second candle contained within the prior long body; suggests momentum loss and possible reversal. |
| `piercing` | Piercing Line | bullish | Bullish two-bar pattern: black candle followed by white candle closing above the midpoint of the black body. |
| `dark_cloud_cover` | Dark Cloud Cover | bearish | Bearish two-bar pattern: white candle followed by black candle opening above prior high and closing deeply into the white body. |

**Three-bar**

| id | Name | Bias | Description |
|----|------|------|-------------|
| `morning_star` | Morning Star | bullish | Three-bar bullish reversal: long black, small gapped body, then strong white close into the first body. |
| `evening_star` | Evening Star | bearish | Three-bar bearish reversal: long white, small gapped body, then strong black close into the first body. |
| `three_white_soldiers` | Three White Soldiers | bullish | Three consecutive bullish candles with higher closes and controlled shadows; strong uptrend continuation or reversal. |
| `three_black_crows` | Three Black Crows | bearish | Three consecutive bearish candles with lower closes opening within prior bodies; strong downtrend signal. |

Each TA-Lib equivalent is documented in catalog metadata (`taLibName`, e.g. `CDLHAMMER`). **`signal`** bias patterns map direction from the raw TA-Lib sign (+100 bullish candle / engulfing, −100 bearish).

### Time-series analyses (`dataKind`: `time_series`)

For **line-only** metrics: `{ time, value }`, `[timestamp, value]` tuples, TVL/fees/index feeds. **Not** OHLC candles.

| Tool | Returns |
|------|---------|
| **`analyze_time_series_trend`** | Direction bias, slope, change %, value peaks/troughs |
| **`analyze_time_series_momentum`** | RSI and rate-of-change on values |
| **`analyze_time_series_stats`** | Min/max/mean, change %, return volatility, compression |

If OHLCV `analyze_*` returns *Line-only time series detected*, switch to the matching `analyze_time_series_*` tool.

Example after fetch:

```json
{
  "title": "<asset> <interval> — <lookback from operator>",
  "toolResult": { "... prior fetch ..." }
}
```

## Linking analysis to plots (deliberate two-step)

Analysis JSON may include hints (e.g. `relatedDrawing` in the catalog). **Drawing on chart is always a separate step:**

1. `calculate_trend_lines` / `calculate_key_levels` / … (geometry)
2. `apply_chart_drawings` with `prepareReplay` from the prior chart

Do not re-fetch OHLCV when adding drawings to an existing chart unless the operator changed symbol, interval, or lookback.

## Orchestration sub-agents

- **Analysis task:** fetch → `analyze_*` → `mpc-task-result` body with JSON; **no** chart attachment.
- **Plot task:** fetch → `prepare_chart_from_rows` → optional drawings → `post_key_gen_chart_attachment`.

See optional skill **`orchestration-chart-analysis`** (on-demand) for task-shape patterns. Base **`orchestration_planning`** skill stays domain-neutral.

## Skills

| Skill | Load | Role |
|-------|------|------|
| `chart-analysis-menu` | initialLoad | Menu workflow, analysis vs plot routing |
| `chart-analysis-trend` | on demand | Narrative template for trend structure |
| `chart-analysis-levels` | on demand | Key levels analysis |
| `chart-analysis-momentum` | on demand | Momentum analysis |
| `chart-analysis-range` | on demand | Range / volatility analysis |
| `chart-analysis-patterns` | on demand | Candlestick pattern recognition narrative |
| `chart-analysis-time-series` | on demand | Line-only metric analyses (TVL, fees, custom series) |
| `orchestration-chart-analysis` | on demand | Plan-mode chart task patterns (no hardcoded symbols/intervals) |
