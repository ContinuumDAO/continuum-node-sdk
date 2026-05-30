const DEFI_PACKAGE = '@continuumdao/ctm-mpc-defi';

/** Map catalog handler.importPath → package subpath export. */
export function defiHandlerModuleSpecifier(importPath: string): string {
	const normalized = importPath.replace(/^\/+/, '').replace(/\.js$/, '');
	return `${DEFI_PACKAGE}/${normalized}`;
}

export async function importDefiHandler(
	importPath: string,
	exportName: string,
): Promise<(...args: unknown[]) => unknown> {
	const mod = (await import(defiHandlerModuleSpecifier(importPath))) as Record<
		string,
		unknown
	>;
	const fn = mod[exportName];
	if (typeof fn !== 'function') {
		throw new Error(
			`DeFi handler ${exportName} not found in ${defiHandlerModuleSpecifier(importPath)}`,
		);
	}
	return fn as (...args: unknown[]) => unknown;
}
