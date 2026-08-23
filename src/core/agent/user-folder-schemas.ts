import {z} from 'zod';
import {userFolderPathError} from './user-folder-path.js';

const userFolderListPath = z
	.string()
	.trim()
	.default('.')
	.superRefine((value, ctx) => {
		const error = userFolderPathError(value, {allowDot: true});
		if (error) {
			ctx.addIssue({code: 'custom', message: error});
		}
	});

const userFolderReadPath = z.string().trim().min(1).superRefine((value, ctx) => {
	const error = userFolderPathError(value);
	if (error) {
		ctx.addIssue({code: 'custom', message: error});
	}
});

const userFolderWritePath = z.string().trim().min(1).superRefine((value, ctx) => {
	const error = userFolderPathError(value, {requireSubtree: true});
	if (error) {
		ctx.addIssue({code: 'custom', message: error});
	}
});

export const ListUserFolderInputSchema = z
	.object({
		path: userFolderListPath,
	})
	.strict();

export const GetUserFolderFileInputSchema = z
	.object({
		path: userFolderReadPath,
	})
	.strict();

export const WriteUserFolderFileInputSchema = z
	.object({
		path: userFolderWritePath,
		content: z.string(),
	})
	.strict();

export const UserFolderEntrySchema = z
	.object({
		name: z.string(),
		type: z.enum(['file', 'dir']),
		size: z.number().int().nonnegative(),
		mtime: z.string().optional(),
	})
	.strict();

export const ListUserFolderOutputSchema = z
	.object({
		path: z.string(),
		entries: z.array(UserFolderEntrySchema),
	})
	.strict();

export const GetUserFolderFileOutputSchema = z
	.object({
		path: z.string(),
		content: z.string(),
		size: z.number().int().nonnegative(),
	})
	.strict();

export const WriteUserFolderFileOutputSchema = z
	.object({
		path: z.string(),
	})
	.strict();
