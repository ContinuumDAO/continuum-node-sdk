import {createHash} from 'node:crypto';
import {CHART_V1_KIND, type PrepareChartOutput} from './schemas.js';

export type ChartAttachmentRef = {
	id?: string;
	title?: string;
	attachmentId: string;
	sha256: string;
	kind: typeof CHART_V1_KIND;
};

export function sha256HexUtf8(text: string): string {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Build mpc-task-result charts[] ref from a prepare_chart envelope (after upload). */
export function buildChartAttachmentRef(
	envelope: PrepareChartOutput,
	upload: {attachmentId: string; sha256?: string},
	options?: {id?: string; title?: string},
): ChartAttachmentRef {
	const json = JSON.stringify(envelope);
	return {
		id: options?.id?.trim() || undefined,
		title: options?.title?.trim() || envelope.chart.title?.trim() || undefined,
		attachmentId: upload.attachmentId.trim(),
		sha256: (upload.sha256 ?? sha256HexUtf8(json)).trim(),
		kind: CHART_V1_KIND,
	};
}

/** Optional inline fallback for tiny charts when attachment upload is unavailable. */
export function formatChartKeyGenFence(envelope: PrepareChartOutput): string {
	const json = JSON.stringify(envelope);
	return '```continuum/chart/v1\n' + json + '\n```';
}

export function formatMpcTaskResultChartsYaml(refs: ChartAttachmentRef[]): string {
	if (refs.length === 0) {
		return '';
	}
	const lines = ['charts:'];
	for (const ref of refs) {
		if (ref.id?.trim()) {
			lines.push(`  - id: ${ref.id.trim()}`);
		} else {
			lines.push('  -');
		}
		if (ref.title?.trim()) {
			lines.push(`    title: ${JSON.stringify(ref.title.trim())}`);
		}
		lines.push(`    attachmentId: ${ref.attachmentId}`);
		lines.push(`    sha256: ${ref.sha256}`);
		lines.push(`    kind: ${ref.kind}`);
	}
	return lines.join('\n');
}
