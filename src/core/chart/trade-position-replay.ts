import type {ChartOverlayInput, ChartTradePositionOverlay} from './overlay-schemas.js';
import type {ChartPrepareReplay, ChartV1Payload} from './schemas.js';
import {
	tradePositionOverlayFromTradeSetup,
	type TradeSetupLevelsSource,
} from './analysis/trade-setups/trade-position-overlay.js';

export function stripTradePositionFromOverlays(
	overlays: ChartOverlayInput[],
): ChartOverlayInput[] {
	return overlays.filter(o => o.type !== 'trade_position');
}

export function mergeTradePositionIntoOverlays(
	overlays: ChartOverlayInput[],
	overlay: ChartTradePositionOverlay | null,
): ChartOverlayInput[] {
	const without = stripTradePositionFromOverlays(overlays);
	return overlay ? [...without, overlay] : without;
}

export function mergeTradePositionIntoReplay(
	baseReplay: ChartPrepareReplay,
	overlay: ChartTradePositionOverlay | null,
): ChartPrepareReplay {
	const overlays = mergeTradePositionIntoOverlays(baseReplay.overlays ?? [], overlay);
	return {...baseReplay, overlays};
}

export function stripTradePositionFromReplay(replay: ChartPrepareReplay): ChartPrepareReplay {
	return mergeTradePositionIntoReplay(replay, null);
}

export function latestTradePositionOverlay(
	overlays: ChartOverlayInput[] | undefined,
): ChartTradePositionOverlay | undefined {
	if (!overlays?.length) {
		return undefined;
	}
	for (let i = overlays.length - 1; i >= 0; i--) {
		const row = overlays[i];
		if (row?.type === 'trade_position') {
			return row;
		}
	}
	return undefined;
}

export function attachTradePositionToOverlays(input: {
	overlays: ChartOverlayInput[];
	tradeSetup?: TradeSetupLevelsSource | null;
	omitTradeRatio?: boolean;
	leverage?: number;
	protocolId?: string | null;
	includeLiquidation?: boolean;
	strip?: boolean;
}): ChartOverlayInput[] {
	if (input.strip || input.omitTradeRatio) {
		return mergeTradePositionIntoOverlays(input.overlays, null);
	}
	const overlay = tradePositionOverlayFromTradeSetup(input.tradeSetup, {
		leverage: input.leverage,
		omitTradeRatio: input.omitTradeRatio,
		protocolId: input.protocolId,
		includeLiquidation: input.includeLiquidation,
	});
	return mergeTradePositionIntoOverlays(input.overlays, overlay);
}

export function chartPayloadWithTradePosition(
	chart: ChartV1Payload,
	overlays: ChartOverlayInput[] | undefined,
): ChartV1Payload {
	const tradePosition = latestTradePositionOverlay(overlays);
	if (!tradePosition) {
		const {tradePosition: _removed, ...rest} = chart as ChartV1Payload & {
			tradePosition?: ChartTradePositionOverlay;
		};
		return rest;
	}
	return {...chart, tradePosition};
}
