import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {registerKeyGenOnLinea} from '../detops/mpc/register-keygen.js';
import {
	getMpaWalletStatus,
	createMpaTopUpMultiSignRequest,
} from '../detops/mpc/mpa-top-up.js';
import {transferNativeGas} from '../detops/mpc/transfer-native.js';
import {
	transferErc20,
	transferErc721,
	transferCtmErc20,
	transferCtmErc20CrossChain,
} from '../detops/mpc/transfer-tokens.js';
import {createComposeMultiSignRequest} from '../detops/mpc/compose-request.js';
import {createForgeMultiSignRequest} from '../detops/mpc/forge-request.js';
import {
	listSignRequestsReady,
	waitForSignRequestReady,
} from '../detops/mpc/list-ready.js';
import {triggerSignResult} from '../detops/mpc/trigger-sign-result.js';
import {broadcastSignResult} from '../detops/mpc/broadcast-sign-result.js';
import {bumpOrCancelSignResult} from '../detops/mpc/bump-sign-result.js';
import {
	BroadcastSignResultInputSchema,
	BroadcastSignResultOutputSchema,
	BumpSignResultInputSchema,
	CreateComposeInputSchema,
	CreateForgeInputSchema,
	CreateMultiSignRequestResultSchema,
	ListReadyInputSchema,
	MpaTopUpInputSchema,
	MpaWalletStatusSchema,
	RegisterKeyGenInputSchema,
	TransferC3InputSchema,
	TransferErc20InputSchema,
	TransferErc721InputSchema,
	TransferNativeInputSchema,
	TriggerSignResultInputSchema,
	TriggerSignResultOutputSchema,
	WaitReadyInputSchema,
	KeyGenIdSchema,
} from '../detops/mpc/schemas.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerMpcTools(server: McpServer, config: NodeSdkConfig): void {
	server.registerTool(
		camelToSnake('registerKeyGenOnLinea'),
		{
			description: 'Register KeyGen with MultiSignAgentWallet on Linea (59144).',
			inputSchema: RegisterKeyGenInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(registerKeyGenOnLinea(config, input)),
	);

	server.registerTool(
		camelToSnake('getMpaWalletStatus'),
		{
			description: 'Read MPA wallet registration and signing credits for a KeyGen.',
			inputSchema: z.object({keyGenId: KeyGenIdSchema}).strict(),
			outputSchema: MpaWalletStatusSchema,
		},
		async ({keyGenId}: {keyGenId: string}) =>
			wrapSdk(getMpaWalletStatus(config, {keyGenId})),
	);

	server.registerTool(
		camelToSnake('createMpaTopUpMultiSignRequest'),
		{
			description:
				'Create batch multiSignRequest (approve + deposit) to top up MPA credits on Linea. Fee token must be on KeyGen executor.',
			inputSchema: MpaTopUpInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(createMpaTopUpMultiSignRequest(config, input)),
	);

	server.registerTool(
		camelToSnake('transferNativeGas'),
		{
			description: 'Create multiSignRequest for native gas transfer (send gas).',
			inputSchema: TransferNativeInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(transferNativeGas(config, input)),
	);

	server.registerTool(
		camelToSnake('transferErc20'),
		{
			description: 'Create multiSignRequest for ERC20 transfer.',
			inputSchema: TransferErc20InputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(transferErc20(config, input)),
	);

	server.registerTool(
		camelToSnake('transferErc721'),
		{
			description: 'Create multiSignRequest for ERC721 transferFrom.',
			inputSchema: TransferErc721InputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(transferErc721(config, input)),
	);

	server.registerTool(
		camelToSnake('transferCtmErc20'),
		{
			description: 'Create multiSignRequest for same-chain CTM ERC20 transfer.',
			inputSchema: TransferErc20InputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(transferCtmErc20(config, input)),
	);

	server.registerTool(
		camelToSnake('transferCtmErc20CrossChain'),
		{
			description: 'Create multiSignRequest for cross-chain c3transfer.',
			inputSchema: TransferC3InputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(transferCtmErc20CrossChain(config, input)),
	);

	server.registerTool(
		camelToSnake('createComposeMultiSignRequest'),
		{
			description: 'Create multiSignRequest from compose actions (single or batch).',
			inputSchema: CreateComposeInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(createComposeMultiSignRequest(config, input)),
	);

	server.registerTool(
		camelToSnake('createForgeMultiSignRequest'),
		{
			description: 'Create multiSignRequest from Foundry broadcast JSON.',
			inputSchema: CreateForgeInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(createForgeMultiSignRequest(config, input)),
	);

	server.registerTool(
		camelToSnake('listSignRequestsReady'),
		{
			description: 'List sign requests ready for Get Sig / Execute.',
			inputSchema: ListReadyInputSchema,
			outputSchema: z.object({requests: z.array(z.unknown())}).strict(),
		},
		async input => wrapSdk(listSignRequestsReady(config, input)),
	);

	server.registerTool(
		camelToSnake('waitForSignRequestReady'),
		{
			description: 'Poll until a sign request appears in the ready list.',
			inputSchema: WaitReadyInputSchema,
			outputSchema: z
				.object({ready: z.boolean(), detail: z.unknown().optional()})
				.strict(),
		},
		async input => wrapSdk(waitForSignRequestReady(config, input)),
	);

	server.registerTool(
		camelToSnake('triggerSignResult'),
		{
			description: 'Get Sig: trigger MPC signing with fresh tx params (does not broadcast).',
			inputSchema: TriggerSignResultInputSchema,
			outputSchema: TriggerSignResultOutputSchema,
		},
		async input => wrapSdk(triggerSignResult(config, input)),
	);

	server.registerTool(
		camelToSnake('broadcastSignResult'),
		{
			description: 'Execute: broadcast signed tx(s) and mark sign result executed.',
			inputSchema: BroadcastSignResultInputSchema,
			outputSchema: BroadcastSignResultOutputSchema,
		},
		async input => wrapSdk(broadcastSignResult(config, input)),
	);

	server.registerTool(
		camelToSnake('bumpOrCancelSignResult'),
		{
			description:
				'Bump or cancel stuck pending txs by creating a new multiSignRequest.',
			inputSchema: BumpSignResultInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(bumpOrCancelSignResult(config, input)),
	);
}
