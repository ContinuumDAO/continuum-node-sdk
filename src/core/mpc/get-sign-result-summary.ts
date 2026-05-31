import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {mpcGetSignResultById} from './client.js';
import {GetSignResultSummaryInputSchema} from './schemas.js';
import {summarizeSignResultForAgent} from './sign-result-summary.js';

export async function getSignResultSummary(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string; signResultSummary: Record<string, unknown>}>> {
	const parsed = GetSignResultSummaryInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get sign result summary input.'};
	}

	const result = await mpcGetSignResultById(config, parsed.data.requestId);
	if (!result.ok) return result;

	return {
		ok: true,
		data: {
			requestId: parsed.data.requestId,
			signResultSummary: summarizeSignResultForAgent(result.data),
		},
	};
}
