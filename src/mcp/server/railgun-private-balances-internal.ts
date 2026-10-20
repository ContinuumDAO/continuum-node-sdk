import type {Express, Request, Response} from 'express';

const RAILGUN_MODULE = '@continuumdao/ctm-mpc-defi/protocols/evm/railgun';

type SnapshotBody = {
	chainId?: number;
	scanStatus?: string;
	balances?: unknown;
	updatedAt?: string;
	notes?: string;
	mnemonic?: unknown;
	encryptionKey?: unknown;
	viewingKey?: unknown;
};

export function mountRailgunPrivateBalanceRoutes(app: Express): void {
	app.post('/internal/railgun-private-balances', (req: Request, res: Response) => {
		void (async () => {
			const body = (req.body ?? {}) as SnapshotBody;
			if (body.mnemonic != null || body.encryptionKey != null || body.viewingKey != null) {
				res.status(400).json({ok: false, error: 'INVALID_REQUEST', message: 'Private wallet secrets are not accepted.'});
				return;
			}
			const chainId = Number(body.chainId);
			const scanStatus = String(body.scanStatus ?? '').trim();
			if (!Number.isFinite(chainId) || chainId <= 0 || !['scanning', 'ready', 'empty', 'error'].includes(scanStatus)) {
				res.status(400).json({ok: false, error: 'INVALID_REQUEST', message: 'chainId and scanStatus are required.'});
				return;
			}
			const balances = Array.isArray(body.balances) ? body.balances : [];
			const mod = (await import(RAILGUN_MODULE as string)) as {
				publishRailgunPrivateBalanceSnapshot?: (snapshot: {
					chainId: number;
					scanStatus: string;
					balances: unknown[];
					updatedAt: string;
					notes?: string;
				}) => void;
			};
			if (typeof mod.publishRailgunPrivateBalanceSnapshot !== 'function') {
				res.status(501).json({ok: false, error: 'UNAVAILABLE', message: 'Railgun snapshot store is not loaded.'});
				return;
			}
			mod.publishRailgunPrivateBalanceSnapshot({
				chainId,
				scanStatus,
				balances,
				updatedAt: String(body.updatedAt ?? new Date().toISOString()),
				notes: typeof body.notes === 'string' ? body.notes : undefined,
			});
			res.status(200).json({ok: true});
		})().catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			res.status(500).json({ok: false, error: 'INTERNAL_ERROR', message});
		});
	});
}
