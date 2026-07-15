import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeElliottWaves, barsFromOhlcvRows} from '../dist/core/elliott-waves/analyze.js';
import {buildElliottWaveTradeSetup} from '../dist/core/chart/analysis/trade-setups/elliott-waves-trade-setup.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';
import {drawableWavesToOverlay, applyElliottWaveDrawings} from '../dist/core/chart/analysis/elliott-wave-drawings-tools.js';
import {prepareChart} from '../dist/core/chart/prepare.js';

function impulseBars(count = 220): Record<string, unknown>[] {
	const bars: Record<string, unknown>[] = [];
	const t0 = 1_700_000_000;
	const phases = [
		{from: 0, to: 30, start: 100, end: 150},
		{from: 30, to: 55, start: 150, end: 118},
		{from: 55, to: 95, start: 118, end: 185},
		{from: 95, to: 120, start: 185, end: 158},
		{from: 120, to: count, start: 158, end: 178},
	];
	for (let i = 0; i < count; i++) {
		const phase = phases.find(p => i >= p.from && i < p.to) ?? phases[phases.length - 1]!;
		const progress = (i - phase.from) / Math.max(1, phase.to - phase.from - 1);
		const mid = phase.start + (phase.end - phase.start) * progress;
		const wiggle = Math.sin(i / 2) * 0.8;
		const open = mid + wiggle;
		const close = mid - wiggle * 0.3;
		bars.push({
			timestampMs: (t0 + i * 3_600) * 1000,
			open,
			high: Math.max(open, close) + 1.5,
			low: Math.min(open, close) - 1.5,
			close,
			volume: 1000 + i,
		});
	}
	return bars;
}

test('analyzeElliottWaves detects structure on synthetic impulse', () => {
	const result = analyzeElliottWaves({bars: impulseBars(), interval: '1h'});
	assert.equal(result.dataStatus, 'ok');
	assert.ok(result.confirmedWaveCount >= 1);
	assert.ok(result.waveMenu.length >= 1);
	assert.ok(result.interpretation.length > 20);
	assert.ok(result.drawableWaves.waves.length >= 1);
});

test('buildElliottWaveTradeSetup returns levels when structure is clear enough', () => {
	const analysis = analyzeElliottWaves({bars: impulseBars(), interval: '1h'});
	const setup = buildElliottWaveTradeSetup(analysis);
	assert.equal(setup.source, 'elliott_waves');
	if (setup.status === 'clear') {
		assert.ok(setup.targetPrice != null);
		assert.ok(setup.invalidationPrice != null);
		assert.ok(setup.side === 'long' || setup.side === 'short');
	} else {
		assert.ok(setup.unclearReason || setup.dataGuidance);
	}
});

test('tradeIdeaFromAnalyzeOutput wraps elliott wave setup', () => {
	const analysis = analyzeElliottWaves({bars: impulseBars(), interval: '1h'});
	const setup = buildElliottWaveTradeSetup(analysis);
	const idea = tradeIdeaFromAnalyzeOutput('analyze_elliott_waves', {
		elliottWaveTradeSetup: setup,
	});
	assert.ok(idea);
	assert.equal(idea!.source.analysisType, 'elliott_waves');
});

test('drawableWavesToOverlay produces elliott_waves overlay', () => {
	const analysis = analyzeElliottWaves({bars: impulseBars(), interval: '1h'});
	const overlay = drawableWavesToOverlay(analysis.drawableWaves);
	assert.ok(overlay);
	assert.equal(overlay!.type, 'elliott_waves');
	assert.ok(overlay!.waves.length >= 1);
	assert.equal(overlay!.markers, undefined);
});

test('drawableWavesToOverlay accepts point.time from JSON round-trip', () => {
	const analysis = analyzeElliottWaves({bars: impulseBars(), interval: '1h'});
	const raw = JSON.parse(JSON.stringify(analysis.drawableWaves)) as Record<string, unknown>;
	const waves = raw.waves as Array<Record<string, unknown>>;
	for (const wave of waves) {
		const pointA = wave.pointA as Record<string, unknown>;
		const pointB = wave.pointB as Record<string, unknown>;
		pointA.time = pointA.timeSec;
		pointB.time = pointB.timeSec;
		delete pointA.timeSec;
		delete pointB.timeSec;
	}
	const overlay = drawableWavesToOverlay(raw as typeof analysis.drawableWaves);
	assert.ok(overlay);
	assert.ok(overlay!.waves.length >= 1);
});

test('insufficient data yields unclear trade setup with guidance', () => {
	const shortBars = impulseBars(60);
	const analysis = analyzeElliottWaves({bars: shortBars, interval: '1h'});
	assert.equal(analysis.dataStatus, 'insufficient_data');
	const setup = buildElliottWaveTradeSetup(analysis);
	assert.equal(setup.status, 'unclear');
	assert.ok(setup.dataGuidance || setup.unclearReason);
});

test('barsFromOhlcvRows normalizes timestamps', () => {
	const bars = barsFromOhlcvRows(impulseBars(5));
	assert.equal(bars.length, 5);
	assert.ok(bars[0]!.timeSec > 0);
});

test('applyElliottWaveDrawings accepts prepareReplay skipDefaultOverlays flags', async () => {
	const bars = impulseBars();
	const analysis = analyzeElliottWaves({bars, interval: '1h'});
	assert.equal(analysis.dataStatus, 'ok');
	const prepared = prepareChart({
		title: 'Elliott apply',
		bars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const applied = await applyElliottWaveDrawings({
		rows: bars,
		title: 'Elliott apply',
		waveMenuNumber: 1,
		analysis,
		prepareReplay: {
			...prepared.data.prepareReplay,
			skipDefaultOverlays: true,
			usedDefaultOverlays: true,
		},
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	assert.ok(
		applied.data.chart.series.some(s => String(s.id ?? '').startsWith('elliott_waves')),
		'expected Elliott wave overlay series on chart',
	);
	const elliott = applied.data.chart.series.filter(s => String(s.id ?? '').startsWith('elliott_waves'));
	assert.ok(!elliott.some(s => String(s.id).includes('_mk_')));
	for (const s of elliott) {
		if (String(s.label).toLowerCase().includes('invalidation')) {
			assert.equal(s.lastValueVisible, true);
		} else {
			assert.equal(s.lastValueVisible, false);
		}
	}
});
