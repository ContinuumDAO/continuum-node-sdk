import type {
	ChartLiquidityDepthProfileOverlay,
	ChartOverlayInput,
} from './overlay-schemas.js';
import type {ChartV1Payload} from './schemas.js';

export function stripLiquidityDepthProfileFromOverlays(
	overlays: ChartOverlayInput[],
): ChartOverlayInput[] {
	return overlays.filter(o => o.type !== 'liquidity_depth_profile');
}

export function mergeLiquidityDepthProfileIntoOverlays(
	overlays: ChartOverlayInput[],
	overlay: ChartLiquidityDepthProfileOverlay | null,
): ChartOverlayInput[] {
	const without = stripLiquidityDepthProfileFromOverlays(overlays);
	return overlay ? [...without, overlay] : without;
}

export function latestLiquidityDepthProfileOverlay(
	overlays: ChartOverlayInput[] | undefined,
): ChartLiquidityDepthProfileOverlay | undefined {
	if (!overlays?.length) {
		return undefined;
	}
	for (let i = overlays.length - 1; i >= 0; i--) {
		const row = overlays[i];
		if (row?.type === 'liquidity_depth_profile') {
			return row;
		}
	}
	return undefined;
}

export function chartPayloadWithLiquidityDepthProfile(
	chart: ChartV1Payload,
	overlays: ChartOverlayInput[] | undefined,
): ChartV1Payload {
	const liquidityDepthProfile = latestLiquidityDepthProfileOverlay(overlays);
	if (!liquidityDepthProfile) {
		const {liquidityDepthProfile: _removed, ...rest} = chart as ChartV1Payload & {
			liquidityDepthProfile?: ChartLiquidityDepthProfileOverlay;
		};
		return rest;
	}
	return {...chart, liquidityDepthProfile};
}
