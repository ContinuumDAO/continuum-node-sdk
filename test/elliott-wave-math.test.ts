import assert from 'node:assert/strict';
import test from 'node:test';
import {projectExtensions, projectRetracements} from '../dist/core/elliott-waves/fibonacci-projector.js';
import {logDistance, withinLogTolerance} from '../dist/core/elliott-waves/wave-math.js';
import {assessElliottWaveDataSufficiency} from '../dist/core/elliott-waves/data-requirements.js';

test('projectRetracements uses log-scale math', () => {
	const targets = projectRetracements(100, 200, [0.618]);
	assert.equal(targets.length, 1);
	assert.ok(targets[0]!.price < 200);
	assert.ok(targets[0]!.price > 100);
});

test('projectExtensions extends in trend direction', () => {
	const targets = projectExtensions(100, 200, 150, [1.0]);
	assert.equal(targets.length, 1);
	assert.ok(targets[0]!.price > 150);
});

test('withinLogTolerance accepts nearby prices', () => {
	assert.equal(withinLogTolerance(100, 101, 0.02), true);
	assert.equal(withinLogTolerance(100, 120, 0.02), false);
});

test('logDistance is symmetric', () => {
	const d = logDistance(100, 200);
	assert.ok(d > 0);
	assert.equal(d, logDistance(200, 100));
});

test('assessElliottWaveDataSufficiency rejects very short windows', () => {
	const result = assessElliottWaveDataSufficiency({barCount: 30, interval: '1h'});
	assert.equal(result.status, 'insufficient_data');
	assert.equal(result.absoluteReject, true);
	assert.match(result.guidance, /30/);
});

test('assessElliottWaveDataSufficiency ok for long 1h window', () => {
	const result = assessElliottWaveDataSufficiency({barCount: 320, interval: '1h'});
	assert.equal(result.status, 'ok');
	assert.equal(result.effectiveDegree, 'intermediate');
});
