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

All accept **`toolResult`** or **`rows`** (same OHLCV shapes as `prepare_chart_from_rows`). Optional **`title`** for `meta`.

| Tool | Returns |
|------|---------|
| **`analyze_trend_structure`** | Bias, swing high/low, HH/HL/range structure, time phases, trend-line scores |
| **`analyze_key_levels`** | Ranked supports/resistances, nearest levels vs last close |
| **`analyze_momentum`** | RSI zone, MACD values, crossover state |
| **`analyze_range_volatility`** | Range %, ATR-style stats, compression vs expansion, Fib swing range |

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
| `orchestration-chart-analysis` | on demand | Plan-mode chart task patterns (no hardcoded symbols/intervals) |
