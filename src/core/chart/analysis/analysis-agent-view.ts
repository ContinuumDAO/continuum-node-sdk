/** Agent-facing analysis payload — omits heavy geometry; UI keeps full structuredContent. */
export function slimAnalysisOutputForAgent(data: {
	analysis: Record<string, unknown>;
	meta?: Record<string, unknown>;
}): Record<string, unknown> {
	const analysis = data.analysis;
	const patternMenu = Array.isArray(analysis.patternMenu)
		? (analysis.patternMenu as Record<string, unknown>[]).map(entry => ({
				index: entry.index,
				patternNumber: typeof entry.index === 'number' ? entry.index + 1 : undefined,
				id: entry.id,
				name: entry.name,
				confidence: entry.confidence,
				classification: entry.classification,
				drawable: entry.drawable,
				isPrimary: entry.isPrimary,
				isHighestConfidence: entry.isHighestConfidence,
				barSpan: entry.barSpan,
				keyLevels: entry.keyLevels,
				measuredMove: entry.measuredMove,
			}))
		: undefined;

	const trendLineMenu = Array.isArray(analysis.trendLineMenu)
		? (analysis.trendLineMenu as Record<string, unknown>[]).map(entry => ({
				index: entry.index,
				trendLineNumber: entry.trendLineNumber,
				kind: entry.kind,
				score: entry.score,
				touchCount: entry.touchCount,
				isPrimary: entry.isPrimary,
				barSpan: entry.barSpan,
				anchors: entry.anchors,
			}))
		: undefined;

	const levelMenu = Array.isArray(analysis.levelMenu)
		? (analysis.levelMenu as Record<string, unknown>[]).map(entry => ({
				index: entry.index,
				levelNumber: entry.levelNumber,
				kind: entry.kind,
				swingKind: entry.swingKind,
				isRoleFlipped: entry.isRoleFlipped,
				price: entry.price,
				strength: entry.strength,
				touchCount: entry.touchCount,
				distancePct: entry.distancePct,
				isPrimary: entry.isPrimary,
				isNearestSupport: entry.isNearestSupport,
				isNearestResistance: entry.isNearestResistance,
			}))
		: undefined;

	const fibPairs = Array.isArray(analysis.fibPairs)
		? (analysis.fibPairs as Record<string, unknown>[]).map(entry => ({
				pairNumber: entry.pairNumber,
				pairKind: entry.pairKind,
				concentricRank: entry.concentricRank,
				lowLevelNumber: entry.lowLevelNumber,
				highLevelNumber: entry.highLevelNumber,
				low: entry.low,
				high: entry.high,
				trend: entry.trend,
				retracement618: entry.retracement618,
				isPrimaryTradePair: entry.isPrimaryTradePair,
			}))
		: undefined;

	const primaryTrendRow = trendLineMenu?.find(entry => entry.isPrimary === true);
	const primaryLevelRow = levelMenu?.find(entry => entry.isPrimary === true);
	const primaryMenuRow = patternMenu?.find(entry => entry.isPrimary === true);
	const highestMenuRow = patternMenu?.find(entry => entry.isHighestConfidence === true);
	const trendSelectionHint =
		primaryTrendRow?.trendLineNumber != null
			? `Primary (highest score)=menu #${primaryTrendRow.trendLineNumber}. Use apply_trend_line_drawings with trendLineNumber.`
			: undefined;
	const primaryFibPair = analysis.primaryFibPair as Record<string, unknown> | null | undefined;
	const levelSelectionHint =
		primaryLevelRow?.levelNumber != null && !primaryFibPair
			? `Primary (highest strength)=menu #${primaryLevelRow.levelNumber}. Use apply_key_level_drawings with levelNumber (horizontal line only).`
			: undefined;
	const fibSelectionHint =
		primaryFibPair?.pairNumber != null
			? `Outer Fib range=pair #${primaryFibPair.pairNumber} (levels #${primaryFibPair.lowLevelNumber}–#${primaryFibPair.highLevelNumber}). Use apply_key_level_drawings with fibPairNumber.`
			: undefined;
	const selectionHint =
		primaryMenuRow?.patternNumber != null
			? `Primary (most recent)=menu #${primaryMenuRow.patternNumber}${
					highestMenuRow?.patternNumber != null &&
					highestMenuRow.patternNumber !== primaryMenuRow.patternNumber
						? `; highest confidence=menu #${highestMenuRow.patternNumber}`
						: highestMenuRow?.patternNumber != null
							? ' (same row as primary)'
							: ''
				}. Default apply without patternNumber uses primary (selectionMode=primary).`
			: undefined;

	const slimPattern = (hit: Record<string, unknown> | null | undefined) => {
		if (!hit || typeof hit !== 'object') {
			return hit ?? null;
		}
		const rawBarSpan = hit.barSpan as Record<string, unknown> | undefined;
		const barSpan =
			rawBarSpan &&
			typeof rawBarSpan.fromTimeSec === 'number' &&
			typeof rawBarSpan.toTimeSec === 'number'
				? {
						fromTimeSec: rawBarSpan.fromTimeSec,
						toTimeSec: rawBarSpan.toTimeSec,
						barCount:
							typeof rawBarSpan.barCount === 'number'
								? rawBarSpan.barCount
								: typeof rawBarSpan.fromIndex === 'number' &&
									  typeof rawBarSpan.toIndex === 'number'
									? rawBarSpan.toIndex - rawBarSpan.fromIndex + 1
									: undefined,
					}
				: undefined;
		return {
			id: hit.id,
			name: hit.name,
			classification: hit.classification,
			confidence: hit.confidence,
			interpretation: hit.interpretation,
			completionState: hit.completionState,
			drawable: hit.drawable,
			...(barSpan?.barCount != null ? {barSpan} : {}),
			...(Array.isArray(hit.keyLevels) ? {keyLevels: hit.keyLevels} : {}),
			...(hit.measuredMove && typeof hit.measuredMove === 'object'
				? {measuredMove: hit.measuredMove}
				: {}),
		};
	};

	return {
		agentView: 'slim',
		analysis: {
			summary: analysis.summary,
			classification: analysis.classification,
			interpretation: analysis.interpretation,
			rationale: analysis.rationale,
			primaryPattern: slimPattern(analysis.primaryPattern as Record<string, unknown> | null),
			highestConfidencePattern: slimPattern(
				analysis.highestConfidencePattern as Record<string, unknown> | null,
			),
			...(patternMenu ? {patternMenu} : {}),
			pattern: slimPattern(analysis.pattern as Record<string, unknown> | null),
			patternCount: Array.isArray(analysis.patterns) ? analysis.patterns.length : 0,
			...(selectionHint ? {selectionHint} : {}),
			...(patternMenu?.length ?
				{
					presentationHint:
						'When presenting patternMenu to the operator, each row MUST include barSpan UTC window (from→to) and every keyLevels entry (label @ price, time when set). Copy from patternMenu below — do not omit dates/times.',
				}
			:	{}),
			...(analysis.chartPatternTradeSetup && typeof analysis.chartPatternTradeSetup === 'object'
				? {chartPatternTradeSetup: analysis.chartPatternTradeSetup}
				: {}),
			...(analysis.candlestickTradeSetup && typeof analysis.candlestickTradeSetup === 'object'
				? {candlestickTradeSetup: analysis.candlestickTradeSetup}
				: {}),
			...(analysis.keyLevelsTradeSetup && typeof analysis.keyLevelsTradeSetup === 'object'
				? {keyLevelsTradeSetup: analysis.keyLevelsTradeSetup}
				: {}),
			...(analysis.keyLevelFibTradeSetup && typeof analysis.keyLevelFibTradeSetup === 'object'
				? {keyLevelFibTradeSetup: analysis.keyLevelFibTradeSetup}
				: {}),
			...(analysis.primaryFibPair && typeof analysis.primaryFibPair === 'object'
				? {primaryFibPair: analysis.primaryFibPair}
				: {}),
			...(analysis.momentumTradeSetup && typeof analysis.momentumTradeSetup === 'object'
				? {momentumTradeSetup: analysis.momentumTradeSetup}
				: {}),
			...(analysis.trendStructureTradeSetup && typeof analysis.trendStructureTradeSetup === 'object'
				? {trendStructureTradeSetup: analysis.trendStructureTradeSetup}
				: {}),
			bias: analysis.bias,
			structure: analysis.structure,
			swingHigh: analysis.swingHigh,
			swingLow: analysis.swingLow,
			phases: analysis.phases,
			...(trendLineMenu ? {trendLineMenu} : {}),
			...(levelMenu ? {levelMenu} : {}),
			...(fibPairs ? {fibPairs} : {}),
			...(trendSelectionHint ? {trendSelectionHint} : {}),
			...(levelSelectionHint ? {levelSelectionHint} : {}),
			...(fibSelectionHint ? {fibSelectionHint} : {}),
			...(trendLineMenu?.length ?
				{
					trendPresentationHint:
						'When presenting trendLineMenu, each row MUST include barSpan UTC window, touchCount, score, and anchor prices. Use Draw trend buttons or apply_trend_line_drawings.',
				}
			:	{}),
			...(levelMenu?.length && !fibPairs?.length ?
				{
					levelPresentationHint:
						'When presenting levelMenu, each row MUST include positional kind (Support/Resistance or Broken …), swingKind when flipped, price, strength, touchCount, distancePct, and nearest badges. Draw level applies horizontal line only (no Fib).',
				}
			:	{}),
			...(fibPairs?.length ?
				{
					fibPresentationHint:
						'When presenting fibPairs, include pairNumber, leg level numbers, 0.618 retrace, and concentric rank. Draw with apply_key_level_drawings and fibPairNumber (not level-only apply).',
				}
			:	{}),
			applyHint:
				patternMenu?.length ?
					'Use the numbered Draw pattern buttons in the chat UI (structured chart.pattern.apply action). Bare "1" also works. Never claim the chart updated without apply_chart_pattern_drawings.'
				: trendLineMenu?.length ?
					'Use the numbered Draw trend buttons in the chat UI (structured chart.trend.apply action) or apply_trend_line_drawings with trendLineNumber. Never claim the chart updated without apply_trend_line_drawings.'
				: fibPairs?.length ?
					'Use apply_key_level_drawings with fibPairNumber from primaryFibPair or fibPairs. Never claim the chart updated without apply_key_level_drawings.'
				: levelMenu?.length ?
					'Use the numbered Draw level buttons in the chat UI (structured chart.key.apply action) or apply_key_level_drawings with levelNumber (line only). Never claim the chart updated without apply_key_level_drawings.'
				: undefined,
		},
		...(data.meta ? {meta: data.meta} : {}),
	};
}
