import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeSupertrend} from '../dist/core/chart/analysis/supertrend-analyze-tools.js';
import {analyzeIchimoku} from '../dist/core/chart/analysis/ichimoku-analyze-tools.js';
import {listChartAnalysisOptions} from '../dist/core/chart/analysis/analysis-catalog.js';

function syntheticBars(n: number): Record<string, unknown>[] {
	const rows: Record<string, unknown>[] = [];
	for (let i = 0; i < n; i++) {
		const close = 100 + Math.sin(i / 8) * 8 + i * 0.08;
		rows.push({
			time: 1_700_000_000 + i * 3600,
			open: close - 1,
			high: close + 2,
			low: close - 2,
			close,
			volume: 1000 + i,
		});
	}
	return rows;
}

test('listChartAnalysisOptions includes supertrend and ichimoku', () => {
	const catalog = listChartAnalysisOptions();
	assert.ok(catalog.analyses.some(a => a.analyzeTool === 'analyze_supertrend'));
	assert.ok(catalog.analyses.some(a => a.analyzeTool === 'analyze_ichimoku'));
	assert.equal(
		catalog.analyses.find(a => a.id === 'supertrend')?.optionalSkill,
		'chart-analysis-supertrend',
	);
	assert.equal(
		catalog.analyses.find(a => a.id === 'ichimoku')?.optionalSkill,
		'chart-analysis-ichimoku',
	);
});

test('analyzeSupertrend returns highlight and trade setup on synthetic OHLCV', async () => {
	const result = await analyzeSupertrend({
		rows: syntheticBars(80),
		allowRowsOnly: true,
		period: 10,
		multiplier: 3,
	});
	assert.equal(result.ok, true, result.ok ? '' : result.reason);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.analysis.period, 10);
	assert.equal(result.data.analysis.multiplier, 3);
	assert.ok(Number.isFinite(result.data.analysis.supertrend));
	assert.ok(result.data.analysis.supertrendHighlight.summary);
	assert.match(result.data.analysis.summary, /ST\(/);
});

test('analyzeIchimoku returns highlight and cloud fields on synthetic OHLCV', async () => {
	const result = await analyzeIchimoku({
		rows: syntheticBars(120),
		allowRowsOnly: true,
		conversionPeriod: 9,
		basePeriod: 26,
		spanPeriod: 52,
		displacement: 26,
	});
	assert.equal(result.ok, true, result.ok ? '' : result.reason);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.analysis.conversionPeriod, 9);
	assert.equal(result.data.analysis.displacement, 26);
	assert.ok(Number.isFinite(result.data.analysis.cloudTop));
	assert.ok(Number.isFinite(result.data.analysis.cloudBottom));
	assert.ok(result.data.analysis.ichimokuHighlight.summary);
	assert.match(result.data.analysis.summary, /Ichimoku/);
});
