import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {resolveTokenImage} from '../../core/registry/token-image.js';
import {TokenTypeSchema} from '../../schemas/extended.js';
import {wrapSdk} from '../tool-utils.js';

const ResolveTokenImageInputSchema = z
	.object({
		chainId: z.union([z.string().min(1), z.number().int().nonnegative()]),
		contractAddress: z.string().min(1),
		tokenId: z.string().optional(),
		tokenType: TokenTypeSchema.optional(),
		chainType: z.string().min(1).optional(),
	})
	.strict();

const ImageItemSchema = z.object({
	url: z.string(),
	resolvedUrl: z.string().optional(),
	alt: z.string().optional(),
	caption: z.string().optional(),
	source: z.enum(['url', 'erc721', 'symbolURL', 'search']),
});

const ImageEnvelopeSchema = z.object({
	kind: z.literal('continuum/image/v1'),
	title: z.string().optional(),
	items: z.array(ImageItemSchema).min(1),
});

export function registerTokenImageTools(server: McpServer, config: NodeSdkConfig): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'resolve_token_image',
		{
			description:
				'Resolve an ERC721 tokenURI or a stored symbolURL (ERC20 / CTMERC20 / CTMRWA1) and return continuum/image/v1 for the node agent popout / Telegram View image window. Does not fetch image bytes. For arbitrary search URLs use host-native agent_show_image.',
			inputSchema: ResolveTokenImageInputSchema,
			outputSchema: ImageEnvelopeSchema,
		},
		async (input: z.infer<typeof ResolveTokenImageInputSchema>) =>
			wrapSdk(resolveTokenImage(config, input)),
	);
}
