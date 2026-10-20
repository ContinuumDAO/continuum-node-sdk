import {randomBytes} from 'node:crypto';

function mul(a: number, b: number): number {
	let product = 0;
	let left = a;
	let right = b;
	for (let bit = 0; bit < 8; bit += 1) {
		if ((right & 1) !== 0) product ^= left;
		const high = left & 0x80;
		left = (left << 1) & 0xff;
		if (high !== 0) left ^= 0x1b;
		right >>= 1;
	}
	return product;
}

function inverse(value: number): number {
	if (value === 0) throw new Error('Shamir inverse of zero.');
	let result = 1;
	let base = value;
	let exp = 254;
	while (exp > 0) {
		if ((exp & 1) !== 0) result = mul(result, base);
		base = mul(base, base);
		exp >>= 1;
	}
	return result;
}

function evalPoly(coeffs: readonly number[], x: number): number {
	let y = 0;
	let xPow = 1;
	for (const coeff of coeffs) {
		y ^= mul(coeff, xPow);
		xPow = mul(xPow, x);
	}
	return y;
}

export function splitSecret(secret: Uint8Array, quorum: number, parties: number): string[] {
	if (quorum < 2 || parties < quorum || parties > 255 || secret.length === 0) {
		throw new Error('A Railgun spending key needs a quorum of at least 2.');
	}
	const shares = Array.from({length: parties}, (_, index) => {
		const share = new Uint8Array(secret.length + 1);
		share[0] = index + 1;
		return share;
	});
	for (let offset = 0; offset < secret.length; offset += 1) {
		const coeffs = [secret[offset]!];
		const random = randomBytes(quorum - 1);
		for (let coeff = 0; coeff < quorum - 1; coeff += 1) coeffs.push(random[coeff]!);
		for (let party = 0; party < parties; party += 1) {
			shares[party]![offset + 1] = evalPoly(coeffs, party + 1);
		}
	}
	return shares.map((share) => Buffer.from(share).toString('hex'));
}

export function combineShares(shares: readonly string[]): string {
	if (shares.length < 2) throw new Error('A Railgun spend needs at least two shares.');
	const parts = shares.map((share) => Buffer.from(share, 'hex'));
	const width = parts[0]?.length ?? 0;
	if (width < 2 || parts.some((part) => part.length !== width)) {
		throw new Error('Railgun spending shares do not match.');
	}
	const xs = parts.map((part) => part[0]!);
	if (new Set(xs).size !== xs.length) throw new Error('Railgun spending shares are duplicated.');
	const secret = new Uint8Array(width - 1);
	for (let offset = 0; offset < secret.length; offset += 1) {
		let value = 0;
		for (let i = 0; i < parts.length; i += 1) {
			let numerator = 1;
			let denominator = 1;
			for (let j = 0; j < parts.length; j += 1) {
				if (i === j) continue;
				numerator = mul(numerator, xs[j]!);
				denominator = mul(denominator, xs[i]! ^ xs[j]!);
			}
			value ^= mul(parts[i]![offset + 1]!, mul(numerator, inverse(denominator)));
		}
		secret[offset] = value;
	}
	return new TextDecoder().decode(secret);
}

export function railgunSigningQuorum(keyType: string, threshold: number): number {
	if (keyType === 'secp256k1' || keyType === 'ed25519' || keyType === 'bitcoin-taproot') {
		return threshold;
	}
	return threshold + 1;
}
