import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	activateCronJob,
	addCronJob,
	deactivateCronJob,
	getCronJob,
	listCronJobRuns,
	listCronJobs,
	removeCronJob,
	runCronJob,
	updateCronJob,
} from '../core/agent/cron-jobs.js';
import {
	AddCronJobInputSchema,
	AgentCronJobDetailSchema,
	AgentCronJobSummarySchema,
	CronJobRefInputSchema,
	GetCronJobQuerySchema,
	ListCronJobRunsDataSchema,
	ListCronJobRunsQuerySchema,
	ListCronJobsDataSchema,
	RemoveCronJobInputSchema,
	RunCronJobOutputSchema,
	SelectedSigningKeySchema,
	UpdateCronJobInputSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const CRON_JOB_MUTATION_OUTPUT_SCHEMA = z
	.object({
		job: AgentCronJobDetailSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const CRON_JOB_REF_MUTATION_OUTPUT_SCHEMA = z
	.object({
		job: AgentCronJobSummarySchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const REMOVE_CRON_JOB_OUTPUT_SCHEMA = z
	.object({
		message: z.string(),
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const RUN_CRON_JOB_OUTPUT_SCHEMA = z
	.object({
		enqueue: RunCronJobOutputSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export function registerAgentCronJobTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('listCronJobs'),
		{
			description:
				'List agent cron job summaries (GET /listCronJobs). Returns schedule and run metadata; message body omitted. Each job has a fixed conversationId — scheduled runs append to that thread.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListCronJobsDataSchema,
		},
		async () => wrapSdk(listCronJobs(config)),
	);

	server.registerTool(
		camelToSnake('getCronJob'),
		{
			description:
				'Get one agent cron job by id or name (GET /getCronJob), including the instruction message.',
			inputSchema: GetCronJobQuerySchema,
			outputSchema: AgentCronJobDetailSchema,
		},
		async (query: z.infer<typeof GetCronJobQuerySchema>) =>
			wrapSdk(getCronJob(config, query)),
	);

	server.registerTool(
		camelToSnake('listCronJobRuns'),
		{
			description:
				'List recent run history for a cron job (GET /listCronJobRuns). Default limit 50.',
			inputSchema: ListCronJobRunsQuerySchema,
			outputSchema: ListCronJobRunsDataSchema,
		},
		async (query: z.infer<typeof ListCronJobRunsQuerySchema>) =>
			wrapSdk(listCronJobRuns(config, query)),
	);

	server.registerTool(
		camelToSnake('addCronJob'),
		{
			description:
				'Create a scheduled agent task (POST /addCronJob, management-signed). Required: name, message, schedule. Schedule must be an object OR a shorthand string — e.g. {"kind":"every","everyMs":300000} for every 5 minutes, "every 5 minutes", "5m", "*/5 * * * *" (cron expr), or {"kind":"cron","expr":"0 7 * * *","tz":"UTC"}. New jobs default enabled.',
			inputSchema: AddCronJobInputSchema,
			outputSchema: CRON_JOB_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof AddCronJobInputSchema>) =>
			wrapSdk(addCronJob(config, input)),
	);

	server.registerTool(
		camelToSnake('updateCronJob'),
		{
			description:
				'Update cron job schedule, message, or deleteAfterRun only (POST /updateCronJob). Schedule accepts object or shorthand string (same as add_cron_job). Does not change enabled — use activate_cron_job or deactivate_cron_job. Requires id or name.',
			inputSchema: UpdateCronJobInputSchema,
			outputSchema: CRON_JOB_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof UpdateCronJobInputSchema>) =>
			wrapSdk(updateCronJob(config, input)),
	);

	server.registerTool(
		camelToSnake('activateCronJob'),
		{
			description:
				'Enable a cron job and recompute nextRunAt (POST /activateCronJob, management-signed).',
			inputSchema: CronJobRefInputSchema,
			outputSchema: CRON_JOB_REF_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof CronJobRefInputSchema>) =>
			wrapSdk(activateCronJob(config, input)),
	);

	server.registerTool(
		camelToSnake('deactivateCronJob'),
		{
			description:
				'Disable a cron job without deleting it (POST /deactivateCronJob). Job, conversation, and run log are retained.',
			inputSchema: CronJobRefInputSchema,
			outputSchema: CRON_JOB_REF_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof CronJobRefInputSchema>) =>
			wrapSdk(deactivateCronJob(config, input)),
	);

	server.registerTool(
		camelToSnake('removeCronJob'),
		{
			description:
				'Remove a cron job (POST /removeCronJob). Default deleteConversation false keeps the linked agent conversation; set true to delete it too.',
			inputSchema: RemoveCronJobInputSchema,
			outputSchema: REMOVE_CRON_JOB_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof RemoveCronJobInputSchema>) =>
			wrapSdk(removeCronJob(config, input)),
	);

	server.registerTool(
		camelToSnake('runCronJob'),
		{
			description:
				'Manually trigger a cron job run (POST /runCronJob). Returns enqueued status immediately; execution is async. Works even when the job is deactivated.',
			inputSchema: CronJobRefInputSchema,
			outputSchema: RUN_CRON_JOB_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof CronJobRefInputSchema>) =>
			wrapSdk(runCronJob(config, input)),
	);
}
