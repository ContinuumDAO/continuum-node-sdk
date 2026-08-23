import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	getUserFolderFile,
	listUserFolder,
	writeUserFolderFile,
} from '../core/agent/user-folder.js';
import {
	GetUserFolderFileInputSchema,
	GetUserFolderFileOutputSchema,
	ListUserFolderInputSchema,
	ListUserFolderOutputSchema,
	WriteUserFolderFileInputSchema,
	WriteUserFolderFileOutputSchema,
} from '../core/agent/user-folder-schemas.js';
import {USER_FOLDER_WRITE_ROOTS} from '../core/agent/user-folder-path.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const WRITE_ROOT_HINT = USER_FOLDER_WRITE_ROOTS.join(', ');

export function registerUserFolderTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('listUserFolder'),
		{
			description:
				'List files and directories in the node user_folder workspace (GET /listUserFolder). ' +
				'Paths are relative to user_folder (container /app/user_folder; host bind mount beside node config). ' +
				'Default path `.` lists the root. Use before write/get to confirm target directories exist. ' +
				`Common subtrees: ${WRITE_ROOT_HINT}.`,
			inputSchema: ListUserFolderInputSchema,
			outputSchema: ListUserFolderOutputSchema,
		},
		async (input: z.infer<typeof ListUserFolderInputSchema>) =>
			wrapSdk(listUserFolder(config, input.path)),
	);

	server.registerTool(
		camelToSnake('getUserFolderFile'),
		{
			description:
				'Read (download) one file from user_folder as UTF-8 text (GET /getUserFolderFile). ' +
				'Path is relative to user_folder — never an absolute host path. ' +
				'Use list_user_folder first when unsure of layout.',
			inputSchema: GetUserFolderFileInputSchema,
			outputSchema: GetUserFolderFileOutputSchema,
		},
		async (input: z.infer<typeof GetUserFolderFileInputSchema>) =>
			wrapSdk(getUserFolderFile(config, input.path)),
	);

	server.registerTool(
		camelToSnake('writeUserFolderFile'),
		{
			description:
				'Write (upload) UTF-8 text to user_folder (POST /writeUserFolderFile, management-signed). ' +
				'Path must be relative and include a subdirectory — not a loose file at user_folder root (same rule as the Workspace UI). ' +
				`Prefer known subtrees: ${WRITE_ROOT_HINT} ` +
				'(Foundry/Solidity under evm/, artifacts under data/, Foundry MCP output under .mcp-foundry-workspace/). ' +
				'Call list_user_folder to verify parent dirs; the node rejects invalid paths.',
			inputSchema: WriteUserFolderFileInputSchema,
			outputSchema: WriteUserFolderFileOutputSchema,
		},
		async (input: z.infer<typeof WriteUserFolderFileInputSchema>) =>
			wrapSdk(writeUserFolderFile(config, input.path, input.content)),
	);
}
