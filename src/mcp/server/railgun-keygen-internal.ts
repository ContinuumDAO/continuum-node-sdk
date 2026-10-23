import type {Express, Request, Response} from 'express';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	completeRailgunKeyGenSpend,
	ensureRailgunKeyGenWallet,
	quoteRailgunKeyGenFee,
	scanRailgunKeyGenBalances,
} from '../defi/railgun-keygen.js';

type Body = {
	keyGenId?: string;
	chainId?: number;
	tokenAddress?: string;
	amountWei?: string;
	recipientAddress?: string;
	memoText?: string;
	kind?: string;
	purpose?: string;
	revealMnemonic?: boolean;
};

function readBody(req: Request): Body {
	return (req.body ?? {}) as Body;
}

export function mountRailgunKeyGenRoutes(app: Express, config: NodeSdkConfig): void {
	const send = (res: Response, run: () => Promise<unknown>) => {
		void run()
			.then((data) => {
				res.status(200).json(data);
			})
			.catch((err: unknown) => {
				const message = err instanceof Error ? err.message : String(err);
				res.status(400).json({ok: false, error: message});
			});
	};

	app.post('/internal/railgun-keygen-ensure', (req, res) => {
		const body = readBody(req);
		send(res, () =>
			ensureRailgunKeyGenWallet(config, String(body.keyGenId ?? ''), {
				chainId: Number(body.chainId),
			}),
		);
	});

	app.post('/internal/railgun-keygen-spend', (req, res) => {
		const body = readBody(req) as Body & {
			spendId?: string;
			kind?: string;
			shares?: string[];
		};
		send(res, () =>
			completeRailgunKeyGenSpend(config, {
				keyGenId: String(body.keyGenId ?? ''),
				spendId: String(body.spendId ?? ''),
				kind: String(body.kind ?? ''),
				chainId: Number(body.chainId),
				tokenAddress: String(body.tokenAddress ?? ''),
				amountWei: String(body.amountWei ?? ''),
				recipientAddress: String(body.recipientAddress ?? ''),
				memoText: body.memoText,
				shares: Array.isArray(body.shares) ? body.shares : [],
			}),
		);
	});

	app.post('/internal/railgun-keygen-fee-quote', (req, res) => {
		const body = readBody(req);
		send(res, () =>
			quoteRailgunKeyGenFee(config, {
				keyGenId: String(body.keyGenId ?? ''),
				chainId: Number(body.chainId),
				kind: String(body.kind ?? ''),
				tokenAddress: String(body.tokenAddress ?? ''),
				amountWei: String(body.amountWei ?? '0'),
				recipientAddress: body.recipientAddress,
				memoText: body.memoText,
			}),
		);
	});

	app.post('/internal/railgun-keygen-scan', (req, res) => {
		const body = readBody(req);
		send(res, () => scanRailgunKeyGenBalances(config, String(body.keyGenId ?? ''), Number(body.chainId)));
	});

}
