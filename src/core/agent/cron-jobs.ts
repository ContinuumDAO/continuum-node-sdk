import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import {
	AGENT_CRON_API_PATHS,
	AddCronJobInputSchema,
	AgentCronJobDetailSchema,
	AgentCronJobSummarySchema,
	AgentCronRunSchema,
	AgentCronScheduleSchema,
	CronJobRefInputSchema,
	DEFAULT_MANAGEMENT_SIGNING,
	GetCronJobQuerySchema,
	ListCronJobRunsDataSchema,
	ListCronJobRunsQuerySchema,
	ListCronJobsDataSchema,
	RemoveCronJobInputSchema,
	RunCronJobOutputSchema,
	UpdateCronJobInputSchema,
	type AddCronJobInput,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigningKey,
	type BuiltManagementPostRequest,
} from '../management-signer.js';
import {z} from 'zod';

export type AgentCronJobSummary = z.infer<typeof AgentCronJobSummarySchema>;
export type AgentCronJobDetail = z.infer<typeof AgentCronJobDetailSchema>;
export type AgentCronRun = z.infer<typeof AgentCronRunSchema>;
export type AgentCronSchedule = z.infer<typeof AgentCronScheduleSchema>;

const CRON_JOB_NAME_RE = /^[a-z][a-z0-9_-]*$/;
const CRON_FIELD_RE =
	/^(\*|\*\/\d+|\d+(?:-\d+)?(?:\/\d+)?(?:,\d+(?:-\d+)?(?:\/\d+)?)*)$/;

export function normalizeCronJobName(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, '-')
		.replace(/^-+/, '')
		.replace(/-+/g, '-');
}

export function validateCronJobName(name: string): string | null {
	const normalized = normalizeCronJobName(name);
	if (!normalized) {
		return 'Cron job name is required.';
	}
	if (normalized.length > 64) {
		return 'Cron job name must be at most 64 characters.';
	}
	if (!CRON_JOB_NAME_RE.test(normalized)) {
		return 'Cron job name must start with a-z and use only a-z, 0-9, hyphen, and underscore.';
	}
	return null;
}

function validateCronExpr(expr: string): string | null {
	const trimmed = expr.trim();
	if (!trimmed) {
		return 'Cron expression is required.';
	}
	const parts = trimmed.split(/\s+/);
	if (parts.length !== 5) {
		return 'Cron expression must have exactly 5 fields (minute hour day month weekday).';
	}
	for (const part of parts) {
		if (!CRON_FIELD_RE.test(part)) {
			return `Invalid cron field: ${part}`;
		}
	}
	return null;
}

export function validateCronSchedule(schedule: AgentCronSchedule): string | null {
	if (schedule.kind === 'every') {
		if (!schedule.everyMs || schedule.everyMs <= 0) {
			return 'Interval must be greater than zero.';
		}
		return null;
	}
	if (schedule.kind === 'cron') {
		const err = validateCronExpr(schedule.expr ?? '');
		if (err) {
			return err;
		}
		return null;
	}
	if (schedule.kind === 'at') {
		if (!schedule.at?.trim()) {
			return 'Date and time are required for a one-off run.';
		}
		const d = new Date(schedule.at);
		if (Number.isNaN(d.getTime())) {
			return 'Invalid date/time.';
		}
		return null;
	}
	return 'Unknown schedule type.';
}

function parseScheduleFromApi(raw: unknown): AgentCronSchedule | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const kind = String(o.kind ?? o.Kind ?? '')
		.trim()
		.toLowerCase();
	if (kind !== 'cron' && kind !== 'every' && kind !== 'at') {
		return null;
	}
	const schedule: Record<string, unknown> = {kind};
	const expr = String(o.expr ?? o.Expr ?? '').trim();
	if (expr) {
		schedule.expr = expr;
	}
	const tz = String(o.tz ?? o.Tz ?? '').trim();
	if (tz) {
		schedule.tz = tz;
	}
	const everyRaw = o.everyMs ?? o.EveryMs;
	if (everyRaw != null && everyRaw !== '') {
		const n = typeof everyRaw === 'number' ? everyRaw : Number(String(everyRaw));
		if (Number.isFinite(n) && n > 0) {
			schedule.everyMs = n;
		}
	}
	const at = String(o.at ?? o.At ?? '').trim();
	if (at) {
		schedule.at = at;
	}
	const parsed = AgentCronScheduleSchema.safeParse(schedule);
	return parsed.success ? parsed.data : null;
}

function scheduleToApiBody(schedule: AgentCronSchedule): Record<string, unknown> {
	const body: Record<string, unknown> = {kind: schedule.kind};
	if (schedule.kind === 'cron') {
		body.expr = schedule.expr.trim();
		const tz = schedule.tz?.trim();
		if (tz) {
			body.tz = tz;
		}
	} else if (schedule.kind === 'every') {
		body.everyMs = schedule.everyMs;
	} else if (schedule.kind === 'at') {
		body.at = schedule.at.trim();
	}
	return body;
}

function parseJobSummary(raw: unknown): AgentCronJobSummary | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const id = String(o.id ?? o.Id ?? '').trim();
	const name = String(o.name ?? o.Name ?? '').trim();
	if (!id || !name) {
		return null;
	}
	const parsed = AgentCronJobSummarySchema.safeParse({
		id,
		name,
		enabled: Boolean(o.enabled ?? o.Enabled ?? false),
		schedule: parseScheduleFromApi(o.schedule ?? o.Schedule),
		conversationId: String(o.conversationId ?? o.ConversationId ?? '').trim(),
		deleteAfterRun:
			o.deleteAfterRun != null || o.DeleteAfterRun != null
				? Boolean(o.deleteAfterRun ?? o.DeleteAfterRun)
				: undefined,
		createdAt: String(o.createdAt ?? o.CreatedAt ?? '').trim() || undefined,
		updatedAt: String(o.updatedAt ?? o.UpdatedAt ?? '').trim() || undefined,
		lastRunAt: String(o.lastRunAt ?? o.LastRunAt ?? '').trim() || undefined,
		nextRunAt: String(o.nextRunAt ?? o.NextRunAt ?? '').trim() || undefined,
		lastRunStatus:
			String(o.lastRunStatus ?? o.LastRunStatus ?? '').trim() || undefined,
	});
	return parsed.success ? parsed.data : null;
}

function parseJobDetail(raw: unknown): AgentCronJobDetail | null {
	const summary = parseJobSummary(raw);
	if (!summary || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const parsed = AgentCronJobDetailSchema.safeParse({
		...summary,
		message: String(o.message ?? o.Message ?? ''),
	});
	return parsed.success ? parsed.data : null;
}

function parseCronRun(raw: unknown): AgentCronRun | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const parsed = AgentCronRunSchema.safeParse({
		runId: String(o.runId ?? o.RunId ?? '').trim(),
		startedAt: String(o.startedAt ?? o.StartedAt ?? '').trim(),
		finishedAt: String(o.finishedAt ?? o.FinishedAt ?? '').trim() || undefined,
		status: String(o.status ?? o.Status ?? '').trim(),
		error: String(o.error ?? o.Error ?? '').trim() || undefined,
		assistantPreview:
			String(o.assistantPreview ?? o.AssistantPreview ?? '').trim() ||
			undefined,
	});
	return parsed.success && parsed.data.runId ? parsed.data : null;
}

function buildCronJobRefFields(ref: {
	id?: string;
	name?: string;
}): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	if (ref.id?.trim()) {
		fields.id = ref.id.trim();
	}
	if (ref.name?.trim()) {
		fields.name = normalizeCronJobName(ref.name);
	}
	return fields;
}

function validateCronJobRef(ref: {id?: string; name?: string}): string | null {
	if (!ref.id?.trim() && !ref.name?.trim()) {
		return 'Job id or name is required.';
	}
	if (ref.name?.trim()) {
		return validateCronJobName(ref.name);
	}
	return null;
}

function buildAddCronJobBodyFields(input: AddCronJobInput): Record<string, unknown> {
	const fields: Record<string, unknown> = {
		name: normalizeCronJobName(input.name),
		message: input.message,
		schedule: scheduleToApiBody(input.schedule),
	};
	if (input.enabled != null) {
		fields.enabled = input.enabled;
	}
	if (input.deleteAfterRun != null) {
		fields.deleteAfterRun = input.deleteAfterRun;
	} else if (input.schedule.kind === 'at') {
		fields.deleteAfterRun = true;
	}
	return fields;
}

/** GET /listCronJobs — agent cron job summaries (message omitted). */
export async function listCronJobs(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof ListCronJobsDataSchema>>> {
	const result = await managementGet<unknown>(config, AGENT_CRON_API_PATHS.list);
	if (!result.ok) {
		return result;
	}
	const data =
		result.data && typeof result.data === 'object' && !Array.isArray(result.data)
			? (result.data as Record<string, unknown>)
			: {};
	const listRaw = data.jobs ?? data.Jobs;
	const jobs: AgentCronJobSummary[] = [];
	if (Array.isArray(listRaw)) {
		for (const item of listRaw) {
			const row = parseJobSummary(item);
			if (row) {
				jobs.push(row);
			}
		}
	}
	const parsed = ListCronJobsDataSchema.safeParse({jobs});
	if (!parsed.success) {
		return {ok: false, reason: 'Cron job list response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

/** GET /getCronJob — one cron job including message. */
export async function getCronJob(
	config: NodeSdkConfig,
	query: z.infer<typeof GetCronJobQuerySchema>,
): Promise<SdkResult<AgentCronJobDetail>> {
	const parsedQuery = GetCronJobQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Job id or name is required.'};
	}
	const refErr = validateCronJobRef(parsedQuery.data);
	if (refErr && parsedQuery.data.name) {
		return {ok: false, reason: refErr};
	}
	const params: Record<string, string | undefined> = {};
	if (parsedQuery.data.id?.trim()) {
		params.id = parsedQuery.data.id.trim();
	} else if (parsedQuery.data.name?.trim()) {
		params.name = normalizeCronJobName(parsedQuery.data.name);
	}
	const path = buildManagementQueryPath(AGENT_CRON_API_PATHS.get, params);
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const job = parseJobDetail(result.data);
	if (!job) {
		return {ok: false, reason: 'Cron job response failed validation.'};
	}
	return {ok: true, data: job};
}

/** GET /listCronJobRuns — recent run history for a job. */
export async function listCronJobRuns(
	config: NodeSdkConfig,
	query: z.infer<typeof ListCronJobRunsQuerySchema>,
): Promise<SdkResult<z.infer<typeof ListCronJobRunsDataSchema>>> {
	const parsedQuery = ListCronJobRunsQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid list cron job runs query.'};
	}
	const params: Record<string, string | undefined> = {
		jobId: parsedQuery.data.jobId.trim(),
		limit:
			parsedQuery.data.limit != null
				? String(parsedQuery.data.limit)
				: undefined,
	};
	const path = buildManagementQueryPath(AGENT_CRON_API_PATHS.listRuns, params);
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const data =
		result.data && typeof result.data === 'object' && !Array.isArray(result.data)
			? (result.data as Record<string, unknown>)
			: {};
	const jobId = String(data.jobId ?? data.JobId ?? parsedQuery.data.jobId).trim();
	const listRaw = data.runs ?? data.Runs;
	const runs: AgentCronRun[] = [];
	if (Array.isArray(listRaw)) {
		for (const item of listRaw) {
			const row = parseCronRun(item);
			if (row) {
				runs.push(row);
			}
		}
	}
	const parsed = ListCronJobRunsDataSchema.safeParse({jobId, runs});
	if (!parsed.success) {
		return {ok: false, reason: 'Cron job run list response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function buildAddCronJob(
	config: NodeSdkConfig,
	input: AddCronJobInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = AddCronJobInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid add cron job input.'};
	}
	const nameErr = validateCronJobName(parsed.data.name);
	if (nameErr) {
		return {ok: false, reason: nameErr};
	}
	const scheduleErr = validateCronSchedule(parsed.data.schedule);
	if (scheduleErr) {
		return {ok: false, reason: scheduleErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_CRON_API_PATHS.add,
			buildRequestFields: () => buildAddCronJobBodyFields(parsed.data),
		},
		signing,
	);
}

export async function addCronJob(
	config: NodeSdkConfig,
	input: AddCronJobInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		job: AgentCronJobDetail;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildAddCronJob(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	const job = parseJobDetail(posted.data);
	if (!job) {
		return {ok: false, reason: 'Add cron job response failed validation.'};
	}
	return {
		ok: true,
		data: {
			job,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigningKey(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildUpdateCronJob(
	config: NodeSdkConfig,
	input: z.infer<typeof UpdateCronJobInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = UpdateCronJobInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid update cron job input.'};
	}
	const refErr = validateCronJobRef(parsed.data);
	if (refErr) {
		return {ok: false, reason: refErr};
	}
	if (parsed.data.schedule) {
		const scheduleErr = validateCronSchedule(parsed.data.schedule);
		if (scheduleErr) {
			return {ok: false, reason: scheduleErr};
		}
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_CRON_API_PATHS.update,
			buildRequestFields: () => {
				const fields: Record<string, unknown> = buildCronJobRefFields(parsed.data);
				if (parsed.data.message != null) {
					fields.message = parsed.data.message;
				}
				if (parsed.data.schedule) {
					fields.schedule = scheduleToApiBody(parsed.data.schedule);
				}
				if (parsed.data.deleteAfterRun != null) {
					fields.deleteAfterRun = parsed.data.deleteAfterRun;
				}
				return fields;
			},
		},
		signing,
	);
}

export async function updateCronJob(
	config: NodeSdkConfig,
	input: z.infer<typeof UpdateCronJobInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		job: AgentCronJobDetail;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildUpdateCronJob(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	const job = parseJobDetail(posted.data);
	if (!job) {
		return {ok: false, reason: 'Update cron job response failed validation.'};
	}
	return {
		ok: true,
		data: {
			job,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigningKey(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

async function postCronJobRefAction(
	config: NodeSdkConfig,
	path: string,
	ref: z.infer<typeof CronJobRefInputSchema>,
	signing: ManagementSigningMethod,
): Promise<
	SdkResult<{
		job: AgentCronJobSummary;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const parsed = CronJobRefInputSchema.safeParse(ref);
	if (!parsed.success) {
		return {ok: false, reason: 'Job id or name is required.'};
	}
	const refErr = validateCronJobRef(parsed.data);
	if (refErr) {
		return {ok: false, reason: refErr};
	}
	const built = await buildManagementPostRequest(
		config,
		{
			path,
			buildRequestFields: () => buildCronJobRefFields(parsed.data),
		},
		signing,
	);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(config, path, signed.data);
	if (!posted.ok) {
		return posted;
	}
	const job = parseJobSummary(posted.data);
	if (!job) {
		return {ok: false, reason: 'Cron job response failed validation.'};
	}
	return {
		ok: true,
		data: {
			job,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigningKey(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildActivateCronJob(
	config: NodeSdkConfig,
	input: z.infer<typeof CronJobRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = CronJobRefInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Job id or name is required.'};
	}
	const refErr = validateCronJobRef(parsed.data);
	if (refErr) {
		return {ok: false, reason: refErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_CRON_API_PATHS.activate,
			buildRequestFields: () => buildCronJobRefFields(parsed.data),
		},
		signing,
	);
}

export async function activateCronJob(
	config: NodeSdkConfig,
	input: z.infer<typeof CronJobRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	return postCronJobRefAction(config, AGENT_CRON_API_PATHS.activate, input, signing);
}

export async function buildDeactivateCronJob(
	config: NodeSdkConfig,
	input: z.infer<typeof CronJobRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = CronJobRefInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Job id or name is required.'};
	}
	const refErr = validateCronJobRef(parsed.data);
	if (refErr) {
		return {ok: false, reason: refErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_CRON_API_PATHS.deactivate,
			buildRequestFields: () => buildCronJobRefFields(parsed.data),
		},
		signing,
	);
}

export async function deactivateCronJob(
	config: NodeSdkConfig,
	input: z.infer<typeof CronJobRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	return postCronJobRefAction(
		config,
		AGENT_CRON_API_PATHS.deactivate,
		input,
		signing,
	);
}

export async function buildRemoveCronJob(
	config: NodeSdkConfig,
	input: z.infer<typeof RemoveCronJobInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = RemoveCronJobInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid remove cron job input.'};
	}
	const refErr = validateCronJobRef(parsed.data);
	if (refErr) {
		return {ok: false, reason: refErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_CRON_API_PATHS.remove,
			buildRequestFields: () => {
				const fields = buildCronJobRefFields(parsed.data);
				if (parsed.data.deleteConversation != null) {
					fields.deleteConversation = parsed.data.deleteConversation;
				}
				return fields;
			},
		},
		signing,
	);
}

export async function removeCronJob(
	config: NodeSdkConfig,
	input: z.infer<typeof RemoveCronJobInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildRemoveCronJob(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<string>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	return {
		ok: true,
		data: {
			message:
				typeof posted.data === 'string' && posted.data.trim()
					? posted.data
					: 'Cron job removed',
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigningKey(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildRunCronJob(
	config: NodeSdkConfig,
	input: z.infer<typeof CronJobRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = CronJobRefInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Job id or name is required.'};
	}
	const refErr = validateCronJobRef(parsed.data);
	if (refErr) {
		return {ok: false, reason: refErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_CRON_API_PATHS.run,
			buildRequestFields: () => buildCronJobRefFields(parsed.data),
		},
		signing,
	);
}

export async function runCronJob(
	config: NodeSdkConfig,
	input: z.infer<typeof CronJobRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		enqueue: z.infer<typeof RunCronJobOutputSchema>;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildRunCronJob(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	const data =
		posted.data && typeof posted.data === 'object' && !Array.isArray(posted.data)
			? (posted.data as Record<string, unknown>)
			: {};
	const parsed = RunCronJobOutputSchema.safeParse({
		jobId: String(data.jobId ?? data.JobId ?? '').trim(),
		runId: String(data.runId ?? data.RunId ?? '').trim(),
		status: String(data.status ?? data.Status ?? '').trim(),
	});
	if (!parsed.success) {
		return {ok: false, reason: 'Run cron job response failed validation.'};
	}
	return {
		ok: true,
		data: {
			enqueue: parsed.data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigningKey(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}
