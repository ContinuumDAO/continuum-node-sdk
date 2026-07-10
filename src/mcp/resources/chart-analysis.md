# Chart analysis (data only — no chart envelope)

Structured OHLCV analysis for agent chat and orchestration. **Does not render charts.**

For plotting and on-chart drawings, see **`chart_docs`** (`chart.md`).

## Data integrity — never invent numbers

**Hard rule:** The agent must **not invent** OHLCV prices, timestamps, volumes, bar counts, period highs/lows, or pattern levels. Every number in chat must come from tool JSON on **this turn**.

| Source | Use for |
|--------|---------|
| **`meta.ohlcvSummary`** | Period **high**, **low**, **lastClose**, **barCount**, time span — ground truth for the loaded bars |
| **`meta.sessionBind`** | `{ title, ohlcvDigest }` for follow-up chart/analyze/apply — **do not re-paste fetch JSON** |
| **`meta.dataPolicy`** | One-line integrity reminder on tool responses |
| **`meta.loadStatus`** / **`meta.warnings`** (charts) | Incomplete fetch, live price issues |
| **`analysis.focusBar`** (candlestick) | Latest scanned bar OHLC |
| **`analysis.pattern` / `patterns[]`** (classic) | Pattern geometry only — still bounded by `meta.ohlcvSummary.high` |
| **`analysis.lastClose`**, **`analysis.levels[]`**, etc. | Typed analysis fields |

**Forbidden:** Pasting reformatted candle tables, “latest bar ~$X” without `focusBar` or `ohlcvSummary`, citing levels when `meta.ohlcvSummary.high` is lower, **stringifying `toolResult`**, mixing `rows` from an old turn with a new fetch.

## Never offer or deliver analysis without tools

**Hard rule:** Do **not** perform interpretive chart/OHLCV analysis in assistant prose without a matching **`analyze_*`** tool result on **this turn**. The UI chart is not a substitute for analysis tools.

| Situation | Wrong | Right |
|-----------|-------|-------|
| Operator asks to analyze / interpret / outlook | Prose-only trend, patterns, momentum | **`list_chart_analysis_options`** (if type unclear) → **`analyze_*`** → summarize tool JSON |
| Chart already visible; operator asks “what patterns?” | Visual read of candles | **`analyze_chart_patterns`** on same OHLCV session |
| After plotting, offering follow-ups | “Want RSI / key levels / patterns?” with no tool names | **`list_chart_analysis_options`**, or each option cites its **`analyze_*`** tool |
| Operator picks an analysis type | Summarize before calling tool | Call **`analyze_*` first**, then reply from **`analysis`** + **`meta`** |

**Routing is allowed without `analyze_*`:** present **`list_chart_analysis_options`** menu, ask operator to pick, quote **`meta.ohlcvSummary`** high/low/lastClose/barCount from the last chart/fetch tool only.

**One fetch per session:** Pass the full fetch object **once** on the first chart/analyze call. Follow-ups use **`{ title, ohlcvDigest }`** from **`meta.sessionBind`** — the node keeps the fetch server-side. Do **not** re-fetch for analysis-only follow-ups unless the operator changed symbol, interval, or lookback.

**Window expectations:** Put **interval + lookback** in every `title` (e.g. `ETH-PERP 15m — last 24h`, `BTC 4H — last 30d`, `ETH 1d — 6 months`). The SDK computes **`meta.windowExpectation`** / **`meta.fetchContext.expectedBarCount`** for any interval × lookback. If `meta.barCount` is far below expected, the payload is truncated or from a different fetch — **hard fail**; fix by passing the same full `toolResult`, not by switching interval.

If the operator asks for raw candles, **re-fetch** and summarize from `meta.ohlcvSummary` — do not reconstruct from memory.

## OHLCV integrity enforcement (SDK)

Chart and analysis tools **reject** bad input before rendering or scanning:

| Check | Effect |
|-------|--------|
| **`rows` without fetch `toolResult`** | **Hard fail** — hand-copied candles are not trusted (all vendors: Hyperliquid, GMX, CoinGecko, CMC, etc.) |
| **Invalid OHLC per bar** | **Hard fail** — e.g. `high < close`, or body at a stale price level while wick matches prior bar (mixed composite) |
| **Title interval ≠ fetch interval** | **Hard fail** — e.g. title `1H` with fetch `12h`; re-fetch at the requested interval, do not switch timeframe |
| **Pattern geometry outside `ohlcvSummary` range** | **Hard fail** on `analyze_chart_patterns` / `apply_chart_pattern_drawings` |
| **`meta.ohlcvFingerprint.digest`** | Fetch identity — stable across chart + analyze even when live merge updates lastClose; must match **`meta.sessionBind.ohlcvDigest`** |

On failure, re-fetch OHLCV and pass the **full** MCP JSON as **`toolResult`** unchanged. Do not retry with edited `rows`.

## “Analyse …” after charting (same session)

When the operator already has a chart and asks to **analyse**, **interpret**, or **add patterns**:

1. Reuse the **same `toolResult`** from the chart step — **no new `fetch_ohlcv`** unless they changed symbol, interval, or lookback.
2. Call **`analyze_*`** with that `toolResult` and the **same `title`** interval/lookback as the chart.
3. Verify **`meta.fetchContext.interval`**, **`meta.windowExpectation.expectedBarCount`**, and **`meta.ohlcvFingerprint.digest`** match the chart response.
4. To draw on the chart: **`apply_chart_pattern_drawings`** with `prepareReplay` + `live` from the chart — not another `prepare_chart_from_rows`.

Works for any vendor (Hyperliquid, GMX, CoinGecko, CMC, etc.) and any interval/lookback the operator requested.

## Live merge on analysis (default)

Every **`analyze_*`** on OHLCV **merges a live tick into the last bar by default** when:

- The data source supports live binding (Hyperliquid, GMX-shaped, CoinGecko market chart)
- The fetch is **current** (not a historical `endTimeMs` in the past)
- The OHLCV tail is at most **one bar** behind now

Check **`meta.liveMerge`** in the response:

| Field | Meaning |
|-------|---------|
| `liveMerge.merged: true` | Last bar updated with live price — quote **`meta.ohlcvSummary.lastClose`** |
| `liveMerge.priorLastClose` | Close before live merge (for comparison) |
| `liveMerge.livePrice` | Tick price used |
| `liveMerge.skippedReason` | Why live was not merged (historical window, stale tail, fetch failed, etc.) |

Set **`mergeLive: false`** for historical backtests or fixed `startTimeMs`/`endTimeMs` windows. Pass **`liveTick`** to skip the network fetch when reusing a tick from chart live poll.

**One OHLCV fetch** still suffices for multiple analyses on the same task — each `analyze_*` call re-merges live at invocation time (small network tick fetch, not a full OHLCV refetch).

## Analysis vs plotting

| Lane | Discovery | Tools | Output |
|------|-----------|-------|--------|
| **Analysis** | `list_chart_analysis_options` | `analyze_*` | JSON `{ analysis, meta }` |
| **Plotting** | `list_chart_customization_options` | `prepare_chart*`, `calculate_*`, `apply_chart_drawings` | `continuum/chart/v1` |

**Do not call `prepare_chart*` or `apply_chart_drawings` for analysis-only requests.**

**Do not call `analyze_*` when the operator only asked to plot or draw on a chart** — use the plotting lane instead.

## “Load data and analyze” (no chart)

When the operator asks to **load**, **fetch**, or **get** OHLCV and **analyze** / **interpret** (without **chart**, **plot**, or **draw**):

1. **Operator chooses** an OHLCV source; load MCP server if needed; fetch OHLCV (DeFi `fetch_ohlcv`, CoinGecko, CMC, etc.). Do not auto-load catalog servers.
2. Call **`analyze_*`** with the fetch JSON as **`toolResult`**.
3. Summarize **`{ analysis, meta }`** in prose.

**Stop there.** Do **not** call **`prepare_chart_from_rows`** — it fills chat context with a rendered chart and is reserved for plot tasks or explicit chart requests.

Orchestration: **analysis sub-agent** returns JSON only; **plot sub-agent** (separate task) may call **`prepare_chart_from_rows`** later.

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
| **`analyze_chart_patterns`** | Classic multi-bar patterns: geometry, **5-level classification**, **interpretation**, **`drawingSpec`**, **`measuredMove`**, **`patternMenu`**, confidence |

**`analyze_candlestick_patterns`** requires at least **14** OHLCV bars (TA-Lib lookback). Optional: `patterns[]` filter, `focusBar` (default last bar), `minConfidence` (0–1). Standalone candlestick hit rates are ~50–55%; use with trend context.

**`analyze_chart_patterns`** requires **25–40** bars depending on pattern (cup & handle ~40; trendline patterns ~20). Optional: `patterns[]`, `focusWindow` (default recent window), `minConfidence` (default 0.45), `swingLookback`, `smoothHeadShoulders` (default **true**), `smoothWindow` (`3`|`5`, default `5`), `retestTolerancePct` (default **0.10**), `retestAtrPeriod` (default **14**), `retestAtrMultiplier` (default **1.0**). Volume is **not** required — OHLC only.

When no credible pattern is found:

```json
{
  "analysis": {
    "summary": "No obvious recent pattern found",
    "classification": null,
    "interpretation": "No completed classic chart pattern met the confidence threshold…",
    "primaryPattern": null,
    "pattern": null,
    "patterns": [],
    "rationale": "Scanned N pattern types on M bars; …"
  }
}
```

When a pattern is found, read **`analysis.interpretation`** first (agent digest), then **`analysis.pattern`** for coordinates and **`drawingSpec`** (canonical chart overlay recipe).

| Field | Purpose |
|-------|---------|
| `summary` | One-line headline |
| `interpretation` | 2–4 sentence implication for the agent |
| `description` | Technical geometry summary on the hit |
| `classification` | `bullish` \| `moderately_bullish` \| `neutral` \| `moderately_bearish` \| `bearish` |
| `primaryPattern` | **Most recent** pattern (`barSpan.toIndex` desc) — slim summary |
| `highestConfidencePattern` | **Highest confidence** pattern (tie-break: most recent) — slim summary |
| `patternMenu[]` | `{ index, patternNumber (1-based), id, name, confidence, drawable, isPrimary, isHighestConfidence, barSpan, keyLevels[], measuredMove? { targetPrice, referencePrice, direction, status, formula } }` — cite **times, prices, and measured-move targets** from these fields |
| `pattern` | Full enriched primary hit (`drawingSpec`, `measuredMove`, `volumeConfirmation`) or `null` |
| `patterns[]` | All enriched hits in menu order |
| `chartPatternTradeSetup` | Primary-pattern trade levels (`status: clear\|unclear`, `side`, **pattern-limit entry** at support/broken boundary retest, target/invalidation from opposite boundary, `entryPhase`, `entryOffsetMode`, `setupPurposeCode`, `lastClose`) — wrapped into `conversation.tradeIdeas[]` for `build_trade_from_*` when `status=clear` |

**Pattern IDs:** use catalog ids (`double_bottom_adam_eve`, `trendline_breakout_retest_bullish`, …). Aliases accepted on apply/calculate: e.g. `adam_eve_double_bottom` → `double_bottom_adam_eve`.

**Selection on apply/calculate:** `patternNumber` (1-based menu # — preferred when the operator says "pattern 1"), `patternIndex` (0-based into `analysis.patterns` / menu order), `selectionMode: 'primary'` (default) \| `'highest_confidence'`, or explicit `patternId`. Do not conflate **primary** (most recent) with **highest confidence**.

### Drawing patterns on the chart (operator workflow)

After **`analyze_chart_patterns`**, the agent-facing JSON is **slim** — it lists **`patternMenu`** but omits full `patterns[]` geometry. The node keeps geometry server-side for the session.

1. **Present** a numbered summary from **`analysis.patternMenu`**. For each row, cite tool JSON only:
   - **Window:** `barSpan.fromTimeSec` → `barSpan.toTimeSec` (UTC ISO from unix seconds) and `barSpan.barCount`
   - **Key levels:** every `keyLevels[]` item as **label @ price** and **time** when `timeSec` is set
   - **Measured move:** when `measuredMove` is present, quote **targetPrice**, **referencePrice**, **status** (`projected` \| `active`), and **direction** from tool JSON — do not invent targets
   - **Trade setup (if asked):** entry at **pattern boundary** (inside bounce or post-breakout retest), invalidation at **pattern-failure** opposite boundary; target from `measuredMove.targetPrice`; compare vs `meta.ohlcvSummary.lastClose` and `entryProximityPct` (default 1% for inside bounces)
   - **`chartPatternTradeSetup`:** structured primary-pattern setup — upserted into **`conversation.tradeIdeas[]`** for **`build_trade_from_chart_pattern`** / **`build_trade_from_trade_idea`**
2. **Ask** which pattern to draw **unless** the operator already named one (e.g. "add pattern 1", "draw the falling wedge").
3. **Call `apply_chart_pattern_drawings`** with `{ title, ohlcvDigest, patternNumber }` plus **`prepareReplay`** + **`live`** from the existing chart — **not** prose describing trendlines.
4. **Confirm drawn** only after **`apply_chart_pattern_drawings`** succeeds (`meta.warnings` mentions overlay applied; chart has `pattern_*` series). Never claim an overlay without that tool result.

Example apply payload after the operator picks menu **#1**:

```json
{
  "title": "ETH-PERP 1H — last 7d",
  "ohlcvDigest": "<from meta.sessionBind>",
  "patternNumber": 1
}
```

Plot workflow: `analyze_chart_patterns` → **`apply_chart_pattern_drawings`** with `toolResult`, `prepareReplay`, `live` from prior `prepare_chart_from_rows`, plus **`patternNumber`** / **`patternId`** / **`patternIndex`** **or** `drawings` from `calculate_chart_pattern_drawings`. Overlay renders **only** `drawingSpec` → `patternOverlay` (no duplicate trend-line / horizontal-level merges). **Never call `prepare_chart_from_rows` again** to add a pattern overlay — that recreates the chart, may switch interval (e.g. 4H), and burns tool rounds.

**Apply toggles (when volume present, default on):** `showVolumeConfirmation` (bar shading at key events), `showVolumeProfile` (pattern-span mini profile). `removeDrawings: true` strips prior pattern overlay only.

**Overlay-only (operator says “draw/add the pattern on the chart”):** one `apply_chart_pattern_drawings` call with:
- `toolResult` — same unmodified OHLCV fetch JSON, or `{ title, ohlcvDigest }` from session bind
- `prepareReplay` + `live` — copied from the existing chart’s `prepare_chart_from_rows` output
- **`patternNumber`** — 1-based menu # when the operator picks from the analysis table (e.g. "pattern 1")
- **or** `patternId` / `patternIndex`, **`analysis`** from `analyze_chart_patterns`, or **`drawings`** from `calculate_chart_pattern_drawings`

If apply fails, fix the payload — do **not** re-fetch at a different interval or call `prepare_chart_from_rows` again.

Example:

```json
{
  "title": "BTC 1d",
  "toolResult": { "... prior OHLCV fetch ..." },
  "patterns": ["hammer", "doji", "engulfing"],
  "focusBar": "last"
}
```

Response includes `analysis.patterns[]` with `name`, `description`, `direction`, `confidence`, plus `primaryPattern`, `recommendation`, `recommendationConfidence`, and `rationale`. **`analysis.focusBar`** gives the exact OHLC of the scanned bar — quote those values in prose; do not invent prices.

**Same data for every step:** use one unmodified fetch **`toolResult`** for `prepare_chart_from_rows`, all `analyze_*`, and `apply_chart_pattern_drawings`. Do not pass hand-copied `rows` from an earlier turn.

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

### Classic chart patterns (multi-bar geometry)

Separate from candlestick patterns. Detectors live in `src/core/chart-patterns/` (clean-room TypeScript; see `REFERENCES.md`).

**Supported pattern ids (v1):** `head_and_shoulders`, `inverse_head_and_shoulders`, `double_top`, `double_bottom`, `double_bottom_adam_eve`, `ascending_triangle`, `descending_triangle`, `symmetrical_triangle`, `pennant_bullish`, `pennant_bearish`, `flag_bullish`, `flag_bearish`, `rising_wedge`, `falling_wedge`, `channel_up`, `channel_down`, `cup_and_handle`, `trendline_breakout_bullish`, `trendline_breakout_bearish`, `trendline_breakout_retest_bullish`, `trendline_breakout_retest_bearish`.

**H&S smoothing (default on):** `smoothHeadShoulders` defaults to `true`. Uses centered Savitzky-Golay on highs/lows before swing detection (similar in spirit to TradingPatternScanner's filtered H&S). Set `smoothHeadShoulders: false` for raw fractal swings. Optional `smoothWindow`: `3` or `5` (default `5`).

**Trendline breakout / retest:** Detects close crossing a swing-based diagonal trendline (`calculateTrendLinesFromBars`). Retest tolerance uses **both** excursion-percent and ATR bands — the effective band is **`max(retestTolerancePct × post-break move, retestAtrMultiplier × ATR)`** (AlgoAlpha / Pineify style). Defaults: **`retestTolerancePct` 0.10**, **`retestAtrPeriod` 14**, **`retestAtrMultiplier` 1.0**. Close must hold the broken line on the retest bar.

Example:

```json
{
  "title": "ETH 1d",
  "toolResult": { "... prior OHLCV fetch ..." },
  "patterns": ["cup_and_handle", "double_bottom"],
  "minConfidence": 0.45
}
```

Sample hit geometry:

```json
{
  "id": "cup_and_handle",
  "name": "Cup and Handle",
  "classification": "moderately_bullish",
  "confidence": 0.58,
  "interpretation": "Cup and handle suggests accumulation… Classification is moderately bullish (moderate confidence, 0.58). …",
  "points": [
    { "timeSec": 1000, "price": 120, "label": "A", "role": "left_rim" },
    { "timeSec": 5000, "price": 95, "label": "B", "role": "cup_bottom" }
  ],
  "lines": [
    { "pointA": { "timeSec": 1000, "price": 120 }, "pointB": { "timeSec": 9000, "price": 119 }, "label": "Cup rim", "kind": "boundary" }
  ]
}
```

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

1. `calculate_trend_lines` / `calculate_key_levels` / `calculate_chart_pattern_drawings` / … (geometry — optional for patterns when passing `analysis` to apply)
2. `apply_chart_drawings` or **`apply_chart_pattern_drawings`** with `prepareReplay` + `live` + `toolResult` from the prior chart — **not** another `prepare_chart_from_rows`

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
| `chart-analysis-classic-patterns` | on demand | Classic chart pattern narrative (H&S, cup & handle, etc.) |
| `chart-analysis-time-series` | on demand | Line-only metric analyses (TVL, fees, custom series) |
| `orchestration-chart-analysis` | on demand | Plan-mode chart task patterns (no hardcoded symbols/intervals) |
