import type {NodeSdkConfig} from '../config/schema.js';
import type {SdkResult} from '../core/result.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../schemas/extended.js';
import {buildManagementPostRequest} from '../core/management-signer.js';
import type {BuiltMultiSignProposal} from '../core/mpc/types.js';
import {
	buildMultiSignProposalBody,
	type BuildMultiSignProposalInput,
} from './proposal-body.js';

export type {BuildMultiSignProposalInput} from './proposal-body.js';
export {buildMultiSignProposalBody} from './proposal-body.js';

export async function buildMultiSignProposal(
	config: NodeSdkConfig,
	input: BuildMultiSignProposalInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltMultiSignProposal>> {
	const builtBody = await buildMultiSignProposalBody(config, input);
	if (!builtBody.ok) {
		return builtBody;
	}

	const built = await buildManagementPostRequest(
		config,
		{
			path: '/multiSignRequest',
			buildRequestFields: () => builtBody.data.bodyForSign,
		},
		signing,
	);
	if (!built.ok) {
		return built;
	}

	return {
		ok: true,
		data: {
			path: '/multiSignRequest',
			unsignedBody: built.data.unsignedBody,
			canonicalJson: built.data.canonicalJson,
			bodyForSign: builtBody.data.bodyForSign,
			chainId: builtBody.data.chainId,
			isBatch: builtBody.data.isBatch,
			selectedSigningKey: built.data.selectedSigningKey,
		},
	};
}
