/**
 * Build unsigned native SegWit v0 (P2WPKH) BTC transfers for multi-sign requests.
 * Uses public Esplora (same hosts as bitcoinPublicBalance.ts).
 */

import * as ecc from '@bitcoinerlab/secp256k1'
import * as bitcoin from 'bitcoinjs-lib'

bitcoin.initEccLib(ecc)

export type BitcoinPublicNetwork = 'mainnet' | 'testnet' | 'signet'

export const BITCOIN_DEST_CHAIN = {
  mainnet: 'bitcoin-mainnet',
  testnet: 'bitcoin-testnet',
  signet: 'bitcoin-signet',
} as const

export function destinationChainIdForBitcoinNetwork(net: BitcoinPublicNetwork): string {
  return BITCOIN_DEST_CHAIN[net]
}

export function bitcoinNetworkFromDestinationChainId(chainId: string): BitcoinPublicNetwork | null {
  const t = chainId.trim().toLowerCase()
  if (t === BITCOIN_DEST_CHAIN.mainnet) return 'mainnet'
  if (t === BITCOIN_DEST_CHAIN.testnet) return 'testnet'
  if (t === BITCOIN_DEST_CHAIN.signet) return 'signet'
  return null
}

export function isBitcoinSignRequestDestinationChain(chainId: string | undefined | null): boolean {
  return bitcoinNetworkFromDestinationChainId(String(chainId ?? '').trim()) != null
}

const ESPLORA_API_BASE: Record<BitcoinPublicNetwork, string> = {
  mainnet: 'https://blockstream.info/api',
  testnet: 'https://blockstream.info/testnet/api',
  signet: 'https://blockstream.info/signet/api',
}

/** [mempool.space](https://mempool.space) REST root per network — used for `/v1/fees/mempool-block` projections (richer than Blockstream Esplora on quiet networks like Signet). */
const MEMPOOL_SPACE_API_ROOT: Record<BitcoinPublicNetwork, string> = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet/api',
  signet: 'https://mempool.space/signet/api',
}

export function esploraApiBase(network: BitcoinPublicNetwork): string {
  return ESPLORA_API_BASE[network]
}

function bitcoinJsNetwork(net: BitcoinPublicNetwork): bitcoin.networks.Network {
  if (net === 'mainnet') return bitcoin.networks.bitcoin
  return bitcoin.networks.testnet
}

/** Mirrors `bitcoinjs-lib` `types.isPoint` — validates compressed / uncompressed secp256k1 pubkey encoding only. */
function isSecp256k1PubkeyBuffer(p: Buffer): boolean {
  if (!Buffer.isBuffer(p) || p.length < 33) return false
  const ZERO32 = Buffer.alloc(32, 0)
  const EC_P = Buffer.from(
    'fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f',
    'hex',
  )
  const t = p[0]
  const x = p.slice(1, 33)
  if (x.compare(ZERO32) === 0) return false
  if (x.compare(EC_P) >= 0) return false
  if ((t === 0x02 || t === 0x03) && p.length === 33) return true
  const y = p.slice(33)
  if (y.compare(ZERO32) === 0) return false
  if (y.compare(EC_P) >= 0) return false
  if (t === 0x04 && p.length === 65) return true
  return false
}

/**
 * Normalize key-gen `pubKey` hex (compressed, uncompressed, or 64-byte x‖y) to a compressed pubkey `Buffer`.
 */
export function normalizeSecp256k1PubkeyHexToCompressed(pubkeyHex: string): Buffer | null {
  const h = pubkeyHex.replace(/^0x/i, '').trim().toLowerCase()
  if (!h || !/^[0-9a-f]+$/.test(h) || h.length % 2 !== 0) return null
  let buf = Buffer.from(h, 'hex')
  if (buf.length === 64) buf = Buffer.concat([Buffer.from([0x04]), buf])
  if (buf.length === 33 && (buf[0] === 0x02 || buf[0] === 0x03)) {
    return isSecp256k1PubkeyBuffer(buf) ? buf : null
  }
  if (buf.length === 65 && buf[0] === 0x04) {
    if (!isSecp256k1PubkeyBuffer(buf)) return null
    const x = buf.subarray(1, 33)
    const isOdd = (buf[64] & 1) === 1
    return Buffer.concat([Buffer.from([isOdd ? 0x03 : 0x02]), x])
  }
  return null
}

/** Native SegWit P2WPKH address derived from the same encoding Bitcoin uses in witness (compressed pubkey). */
export function p2wpkhAddressFromSecp256k1PubkeyHex(
  pubkeyHex: string,
  network: BitcoinPublicNetwork,
): string | null {
  const pk = normalizeSecp256k1PubkeyHexToCompressed(pubkeyHex)
  if (!pk) return null
  try {
    const pay = bitcoin.payments.p2wpkh({ pubkey: pk, network: bitcoinJsNetwork(network) })
    return pay.address ?? null
  } catch {
    return null
  }
}

export function bitcoinAddressesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * If non-null, broadcast would fail script verification: witness pubkey hash ≠ spent P2WPKH output.
 */
export function bitcoinSignedP2wpkhWitnessFromAddressError(
  rawHex: string,
  fromAddress: string,
  network: BitcoinPublicNetwork,
): string | null {
  let tx: bitcoin.Transaction
  try {
    tx = bitcoin.Transaction.fromHex(rawHex.replace(/^0x/i, '').trim())
  } catch {
    return 'Invalid signed transaction hex.'
  }
  if (tx.ins.length < 1) return 'Signed transaction has no inputs.'
  const w = tx.ins[0].witness
  if (!w || w.length < 2) {
    return 'Signed transaction input 0 is missing SegWit witness data.'
  }
  const pubkeyBuf = w[w.length - 1]
  if (!Buffer.isBuffer(pubkeyBuf) || pubkeyBuf.length !== 33 || !isSecp256k1PubkeyBuffer(pubkeyBuf)) {
    return 'Signed transaction witness does not contain a compressed secp256k1 pubkey (unexpected format).'
  }
  let derived: string | undefined
  try {
    derived = bitcoin.payments.p2wpkh({
      pubkey: pubkeyBuf,
      network: bitcoinJsNetwork(network),
    }).address
  } catch {
    return 'Could not derive Bitcoin address from witness pubkey.'
  }
  const from = fromAddress.trim()
  if (!derived || !bitcoinAddressesEqual(derived, from)) {
    return `Witness pubkey corresponds to ${derived ?? '?'}, but this request spends from ${from}. Nodes reject that as “witness program hash mismatch”—the signer attached the wrong pubkey or the wrong key signed.`
  }
  return null
}

/**
 * Minimum P2WPKH output value (satoshis) under typical Bitcoin Core relay rules.
 * Paying a fee while sending less fails broadcast (`reject-deprecation`, RPC -26 dust).
 */
export const BITCOIN_P2WPKH_MIN_RELAY_OUTPUT_SATS = 546

/**
 * Minimum P2TR (key-path) output value (satoshis) under typical Bitcoin Core relay rules.
 */
export const BITCOIN_P2TR_MIN_RELAY_OUTPUT_SATS = 330

export type BitcoinTransferScriptType = 'p2wpkh' | 'p2tr'

export function minRelayOutputSatsForBitcoinScriptType(scriptType: BitcoinTransferScriptType): number {
  return scriptType === 'p2tr' ? BITCOIN_P2TR_MIN_RELAY_OUTPUT_SATS : BITCOIN_P2WPKH_MIN_RELAY_OUTPUT_SATS
}

const DUST_SATS = BITCOIN_P2WPKH_MIN_RELAY_OUTPUT_SATS

export type EsploraUtxo = {
  txid: string
  vout: number
  value: number
  status?: { confirmed?: boolean }
}

export async function fetchAddressUtxos(
  network: BitcoinPublicNetwork,
  address: string,
  signal?: AbortSignal,
): Promise<EsploraUtxo[]> {
  const url = `${ESPLORA_API_BASE[network]}/address/${encodeURIComponent(address)}/utxo`
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) {
    const t = await res.text()
    throw new Error((t && t.slice(0, 200)) || `UTXO fetch HTTP ${res.status}`)
  }
  const arr = (await res.json()) as EsploraUtxo[]
  if (!Array.isArray(arr)) return []
  return arr.filter((u) => u && typeof u.txid === 'string' && typeof u.vout === 'number' && typeof u.value === 'number')
}

/** Fee estimates (sat/vB) keyed by confirmation target blocks. */
/** Txid of a raw Bitcoin transaction, computed locally. */
export function bitcoinTxIdFromRawHex(rawHex: string): string {
  return bitcoin.Transaction.fromHex(rawHex.replace(/^0x/i, '').trim()).getId()
}

/** Broadcast raw tx hex (Esplora). Returns txid string from API body. */
export async function broadcastBitcoinRawTxEsplora(network: BitcoinPublicNetwork, rawHex: string): Promise<string> {
  const h = rawHex.replace(/^0x/i, '').trim()
  const res = await fetch(`${ESPLORA_API_BASE[network]}/tx`, {
    method: 'POST',
    body: h,
    headers: { 'Content-Type': 'text/plain' },
    cache: 'no-store',
  })
  const text = (await res.text()).trim()
  if (!res.ok) {
    const t = text.slice(0, 400)
    const low = t.toLowerCase()
    if (low.includes('dust')) {
      throw new Error(
        `Broadcast rejected (dust): payment outputs must be at least ${BITCOIN_P2WPKH_MIN_RELAY_OUTPUT_SATS} satoshis when the transaction pays a fee.`,
      )
    }
    if (low.includes('witness program hash mismatch') || low.includes('mempool-script-verify-flag-failed')) {
      throw new Error(
        'Broadcast rejected: witness pubkey does not match the spent output (witness program hash mismatch). The MPC signature must use the same secp256k1 key as the sender P2WPKH address.',
      )
    }
    throw new Error(t || `Broadcast HTTP ${res.status}`)
  }
  return text
}

export async function fetchFeeEstimatesSatPerVbyte(
  network: BitcoinPublicNetwork,
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const url = `${ESPLORA_API_BASE[network]}/fee-estimates`
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) {
    const t = await res.text()
    throw new Error((t && t.slice(0, 200)) || `Fee estimates HTTP ${res.status}`)
  }
  const data = (await res.json()) as Record<string, number>
  return data && typeof data === 'object' ? data : {}
}

export type MempoolProjectedBlock = { feeRange?: number[] }

/**
 * Next projected mempool blocks with per-block fee histograms (`feeRange`), same source as the mempool.space UI.
 * Returns null if the request fails (caller should fall back to Esplora-only {@link feeRateSatPerVbyteForTier}).
 */
export async function fetchMempoolSpaceMempoolBlocks(
  network: BitcoinPublicNetwork,
  signal?: AbortSignal,
): Promise<MempoolProjectedBlock[] | null> {
  const url = `${MEMPOOL_SPACE_API_ROOT[network]}/v1/fees/mempool-blocks`
  try {
    const res = await fetch(url, { signal, cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    if (!Array.isArray(data)) return null
    return data as MempoolProjectedBlock[]
  } catch {
    return null
  }
}

function pickFeeRateFromEstimates(est: Record<string, number>, targetBlocks: number, floor = 1): number {
  const key = String(targetBlocks)
  let r = est[key]
  if (typeof r === 'number' && Number.isFinite(r) && r > 0) return Math.max(floor, Math.ceil(r))
  const numericKeys = Object.keys(est)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
  let best = floor
  for (const k of numericKeys) {
    const v = est[String(k)]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      best = Math.max(best, Math.ceil(v))
      if (k >= targetBlocks) break
    }
  }
  return Math.max(floor, best)
}

export type GetSigFeeSpeedTier = 'slow' | 'normal' | 'fast'

export type BitcoinTransferFeeSpeedTier = GetSigFeeSpeedTier | 'advanced'

export type BitcoinMergedFeeRates = {
  slow: number
  normal: number
  fast: number
}

/** Resolve sat/vB for compose / Get Sig from merged tiers and optional Advanced override. */
export function resolveBitcoinFeeRateSatPerVbyte(
  merged: BitcoinMergedFeeRates,
  tier: BitcoinTransferFeeSpeedTier,
  advancedSatPerVbyte?: string,
): number {
  if (tier === 'advanced') {
    const adv = (advancedSatPerVbyte ?? '').trim()
    const n = Number(adv)
    if (adv !== '' && Number.isFinite(n) && n >= 1) return Math.ceil(n)
    return merged.normal
  }
  return merged[tier]
}

/** Blockstream Esplora `fee-estimates` only (~confirmation targets in blocks). */
export function feeRateSatPerVbyteForTier(est: Record<string, number>, tier: GetSigFeeSpeedTier): number {
  if (tier === 'slow') return pickFeeRateFromEstimates(est, 144, 1)
  if (tier === 'normal') return pickFeeRateFromEstimates(est, 18, 2)
  return pickFeeRateFromEstimates(est, 6, 3)
}

function positiveFeeRangeRates(block: MempoolProjectedBlock | undefined): number[] {
  const fr = block?.feeRange
  if (!Array.isArray(fr)) return []
  const out: number[] = []
  for (const x of fr) {
    if (typeof x === 'number' && Number.isFinite(x) && x > 0) out.push(x)
  }
  return out
}

/** Signet/testnet mempool `feeRange` tails can dwarf typical rates; Esplora targets are safer for drafting. */
function useEsploraOnlyBitcoinFeeMerge(network: BitcoinPublicNetwork): boolean {
  return network === 'signet' || network === 'testnet'
}

/** Representative sat/vB from mempool.space `feeRange` (ignore single-tx outliers when spread is wide). */
function representativeMempoolFeeRateSatPerVbyte(sorted: number[]): number {
  const minR = sorted[0]
  const maxR = sorted[sorted.length - 1]
  if (maxR <= minR * 1.5) return maxR
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * Derive sat/vB from mempool.space projected block(s). On Signet, `fee-estimates` can sit near 1 sat/vB while
 * `mempool-blocks` still exposes a high-fee tail in `feeRange` ( txs competitive for the next template ).
 */
export function feeRateSatPerVbyteFromMempoolBlocks(
  blocks: MempoolProjectedBlock[] | null | undefined,
  tier: GetSigFeeSpeedTier,
): number | null {
  if (!blocks?.length) return null
  const sortedStats = (block: MempoolProjectedBlock | undefined) => {
    const pos = positiveFeeRangeRates(block)
    if (!pos.length) return null
    const sorted = [...pos].sort((a, b) => a - b)
    const minR = sorted[0]
    const maxR = sorted[sorted.length - 1]
    const midR = representativeMempoolFeeRateSatPerVbyte(sorted)
    return { minR, maxR, midR }
  }
  if (tier === 'slow') {
    const last = blocks[Math.min(blocks.length - 1, Math.max(0, blocks.length - 1))]
    const later = blocks.length >= 2 ? blocks[blocks.length - 1] : last
    const pos = positiveFeeRangeRates(later)
    if (pos.length) return Math.max(1, Math.ceil(Math.min(...pos)))
    return null
  }
  if (tier === 'normal') {
    const block = blocks[Math.min(1, blocks.length - 1)]
    const s = sortedStats(block)
    if (!s) return null
    return Math.max(1, Math.ceil(s.midR))
  }
  const s0 = sortedStats(blocks[0])
  if (!s0) return null
  return Math.max(1, Math.ceil(s0.maxR))
}

/** Combine Esplora targets with mempool.space projections — use the higher of the two when both apply. */
export function mergeBitcoinFeeRateSatPerVbyte(
  esploraEst: Record<string, number>,
  mempoolBlocks: MempoolProjectedBlock[] | null | undefined,
  tier: GetSigFeeSpeedTier,
  network?: BitcoinPublicNetwork,
): number {
  const e = feeRateSatPerVbyteForTier(esploraEst, tier)
  if (network != null && useEsploraOnlyBitcoinFeeMerge(network)) return e
  const m = feeRateSatPerVbyteFromMempoolBlocks(mempoolBlocks, tier)
  if (m == null) return e
  return Math.max(e, m)
}

export async function fetchBitcoinFeeRatesMerged(
  network: BitcoinPublicNetwork,
  signal?: AbortSignal,
): Promise<{
  esplora: Record<string, number>
  mempoolBlocks: MempoolProjectedBlock[] | null
  slow: number
  normal: number
  fast: number
}> {
  const [esplora, mempoolBlocks] = await Promise.all([
    fetchFeeEstimatesSatPerVbyte(network, signal),
    fetchMempoolSpaceMempoolBlocks(network, signal),
  ])
  return {
    esplora,
    mempoolBlocks,
    slow: mergeBitcoinFeeRateSatPerVbyte(esplora, mempoolBlocks, 'slow', network),
    normal: mergeBitcoinFeeRateSatPerVbyte(esplora, mempoolBlocks, 'normal', network),
    fast: mergeBitcoinFeeRateSatPerVbyte(esplora, mempoolBlocks, 'fast', network),
  }
}

function estimateTxVbytes(inputCount: number, outputCount: number): number {
  if (inputCount <= 0 || outputCount <= 0) return 1000
  const overhead = 10
  const inVb = 68 * inputCount
  const outVb = 31 * outputCount
  return overhead + inVb + outVb
}

/** Key-path P2TR input + P2TR output vsize estimate (conservative ceil). */
function estimateP2trKeyPathTxVbytes(inputCount: number, outputCount: number): number {
  if (inputCount <= 0 || outputCount <= 0) return 110
  return Math.ceil(10.5 + 58 * inputCount + 43 * outputCount)
}

/**
 * One UTXO only so the sign request carries a single digest (input 0).
 * If nothing covers amount+fee alone, ask the user to consolidate.
 */
function selectSingleUtxoForTarget(utxos: EsploraUtxo[], target: number): EsploraUtxo[] {
  const sorted = [...utxos].sort((a, b) => b.value - a.value)
  for (const u of sorted) {
    if (u.value >= target) return [u]
  }
  throw new Error(
    'No single UTXO covers this amount plus fee. Consolidate into one larger UTXO first, then retry.',
  )
}

export type BitcoinTransferDraft = {
  unsignedTxHex: string
  /** BIP143 sighash for input 0 (32-byte hex, no 0x). */
  msgHashHex: string
  feeSats: number
  feeRateSatPerVbyte: number
  /** Change returned to sender (0 when omitted as dust). */
  changeSats: bigint
  inputCount: number
  outputCount: number
  vbytesEstimate: number
  selectedUtxos: EsploraUtxo[]
}

/**
 * Build unsigned witness tx + sighash for input 0 (inputs spend **from** P2WPKH only).
 */
export function buildP2wpkhTransferDraft(params: {
  network: BitcoinPublicNetwork
  fromAddress: string
  toAddress: string
  amountSats: bigint
  feeRateSatPerVbyte: number
  utxoPool: EsploraUtxo[]
  /** When set, only these UTXOs are used (must match live list order for signing). */
  lockedInputs?: EsploraUtxo[]
}): BitcoinTransferDraft {
  const { network, fromAddress, toAddress, amountSats, feeRateSatPerVbyte, utxoPool, lockedInputs } = params
  if (amountSats <= 0n) throw new Error('Amount must be positive.')
  if (amountSats < BITCOIN_P2WPKH_MIN_RELAY_OUTPUT_SATS) {
    throw new Error(
      `Amount must be at least ${BITCOIN_P2WPKH_MIN_RELAY_OUTPUT_SATS} satoshis (Bitcoin dust limit). Smaller outputs cannot be broadcast when the transaction pays a network fee.`,
    )
  }
  if (!Number.isFinite(feeRateSatPerVbyte) || feeRateSatPerVbyte < 1) throw new Error('Invalid fee rate.')

  const nw = bitcoinJsNetwork(network)
  let paymentFrom: bitcoin.payments.Payment
  let toScript: Buffer
  try {
    paymentFrom = bitcoin.payments.p2wpkh({ address: fromAddress, network: nw })
    toScript = bitcoin.address.toOutputScript(toAddress, nw)
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Invalid Bitcoin address for this network.')
  }
  const fromScript = paymentFrom.output
  if (!fromScript) throw new Error('Sender must be a native SegWit (P2WPKH) address for this flow.')

  const scriptCode = bitcoin.payments.p2pkh({ hash: paymentFrom.hash, network: nw }).output
  if (!scriptCode) throw new Error('Could not build scriptCode for sighash.')

  if (!utxoPool.length) throw new Error('No UTXOs available.')

  let inputs: EsploraUtxo[] = lockedInputs ? [...lockedInputs] : []

  for (let attempt = 0; attempt < 24; attempt++) {
    const useLocked = lockedInputs != null && lockedInputs.length > 0
    if (useLocked && lockedInputs!.length !== 1) {
      throw new Error('Bitcoin MPC transfer expects exactly one input UTXO. Consolidate and create a new request.')
    }
    const nIn = 1
    let nOut = 2
    let vbytes = estimateTxVbytes(nIn, nOut)
    let feeSats = Math.ceil(vbytes * feeRateSatPerVbyte)
    const need = Number(amountSats) + feeSats

    if (!useLocked) {
      inputs = selectSingleUtxoForTarget(utxoPool, need)
    }

    let sumIn = inputs.reduce((s, u) => s + u.value, 0)
    if (sumIn < need) {
      if (useLocked) throw new Error('Locked UTXOs no longer cover amount and fee. Create a new request.')
      inputs = selectSingleUtxoForTarget(utxoPool, need)
      sumIn = inputs.reduce((s, u) => s + u.value, 0)
    }

    let change = sumIn - Number(amountSats) - feeSats
    nOut = change > DUST_SATS ? 2 : 1
    vbytes = estimateTxVbytes(nIn, nOut)
    feeSats = Math.ceil(vbytes * feeRateSatPerVbyte)

    sumIn = inputs.reduce((s, u) => s + u.value, 0)
    change = sumIn - Number(amountSats) - feeSats

    if (change < 0) {
      if (useLocked) throw new Error('Locked UTXOs no longer cover amount and fee. Create a new request.')
      continue
    }

    const tx = new bitcoin.Transaction()
    tx.version = 2
    for (const u of inputs) {
      const hash = Buffer.from(u.txid, 'hex').reverse()
      tx.addInput(hash, u.vout, 0xffffffff)
    }
    tx.addOutput(toScript, Number(amountSats))

    let changeSats = 0n
    if (change > DUST_SATS) {
      tx.addOutput(fromScript, change)
      changeSats = BigInt(change)
    }

    const vbFinal = estimateTxVbytes(inputs.length, tx.outs.length)
    const feeFinal = Math.ceil(vbFinal * feeRateSatPerVbyte)
    const change2 = sumIn - Number(amountSats) - feeFinal

    if (change2 < 0) {
      if (useLocked) throw new Error('Locked UTXOs no longer cover amount and fee. Create a new request.')
      continue
    }

    if (change2 > DUST_SATS && tx.outs.length === 1) {
      tx.addOutput(fromScript, change2)
      changeSats = BigInt(change2)
    } else if (change2 <= DUST_SATS && tx.outs.length === 2) {
      tx.outs.pop()
      changeSats = 0n
    } else if (change2 > DUST_SATS && tx.outs.length === 2) {
      tx.outs[1] = { script: fromScript, value: change2 }
      changeSats = BigInt(change2)
    }

    const feeDone = sumIn - Number(amountSats) - Number(changeSats)
    const vbDone = estimateTxVbytes(inputs.length, tx.outs.length)
    const minFee = Math.ceil(vbDone * feeRateSatPerVbyte)
    if (feeDone < minFee) {
      if (useLocked) throw new Error('Fee too low for current mempool rules; create a new request with a higher fee.')
      continue
    }

    const val0 = inputs[0]?.value
    if (val0 == null) throw new Error('Missing input value.')
    const sighash = tx.hashForWitnessV0(0, scriptCode, val0, bitcoin.Transaction.SIGHASH_ALL)
    const msgHashHex = Buffer.from(sighash).toString('hex')

    return {
      unsignedTxHex: tx.toHex(),
      msgHashHex,
      feeSats: feeDone,
      feeRateSatPerVbyte,
      changeSats,
      inputCount: inputs.length,
      outputCount: tx.outs.length,
      vbytesEstimate: vbDone,
      selectedUtxos: inputs,
    }
  }

  throw new Error('Could not converge on fee and change.')
}

/**
 * Build unsigned key-path Taproot (P2TR) tx + BIP341 sighash for input 0.
 */
export function buildP2trKeyPathTransferDraft(params: {
  network: BitcoinPublicNetwork
  fromAddress: string
  toAddress: string
  amountSats: bigint
  feeRateSatPerVbyte: number
  utxoPool: EsploraUtxo[]
  lockedInputs?: EsploraUtxo[]
}): BitcoinTransferDraft {
  const { network, fromAddress, toAddress, amountSats, feeRateSatPerVbyte, utxoPool, lockedInputs } = params
  if (amountSats <= 0n) throw new Error('Amount must be positive.')
  if (amountSats < BITCOIN_P2TR_MIN_RELAY_OUTPUT_SATS) {
    throw new Error(
      `Amount must be at least ${BITCOIN_P2TR_MIN_RELAY_OUTPUT_SATS} satoshis (Bitcoin Taproot dust limit). Smaller outputs cannot be broadcast when the transaction pays a network fee.`,
    )
  }
  if (!Number.isFinite(feeRateSatPerVbyte) || feeRateSatPerVbyte < 1) throw new Error('Invalid fee rate.')

  const nw = bitcoinJsNetwork(network)
  let paymentFrom: bitcoin.payments.Payment
  let toScript: Buffer
  try {
    paymentFrom = bitcoin.payments.p2tr({ address: fromAddress, network: nw })
    toScript = bitcoin.address.toOutputScript(toAddress, nw)
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Invalid Bitcoin Taproot address for this network.')
  }
  const fromScript = paymentFrom.output
  if (!fromScript) throw new Error('Sender must be a Taproot (P2TR) address for this flow.')

  const dustSats = BITCOIN_P2TR_MIN_RELAY_OUTPUT_SATS
  if (!utxoPool.length) throw new Error('No UTXOs available.')

  let inputs: EsploraUtxo[] = lockedInputs ? [...lockedInputs] : []

  for (let attempt = 0; attempt < 24; attempt++) {
    const useLocked = lockedInputs != null && lockedInputs.length > 0
    if (useLocked && lockedInputs!.length !== 1) {
      throw new Error('Bitcoin MPC transfer expects exactly one input UTXO. Consolidate and create a new request.')
    }
    const nIn = 1
    let nOut = 2
    let vbytes = estimateP2trKeyPathTxVbytes(nIn, nOut)
    let feeSats = Math.ceil(vbytes * feeRateSatPerVbyte)
    const need = Number(amountSats) + feeSats

    if (!useLocked) {
      inputs = selectSingleUtxoForTarget(utxoPool, need)
    }

    let sumIn = inputs.reduce((s, u) => s + u.value, 0)
    if (sumIn < need) {
      if (useLocked) throw new Error('Locked UTXOs no longer cover amount and fee. Create a new request.')
      inputs = selectSingleUtxoForTarget(utxoPool, need)
      sumIn = inputs.reduce((s, u) => s + u.value, 0)
    }

    let change = sumIn - Number(amountSats) - feeSats
    nOut = change > dustSats ? 2 : 1
    vbytes = estimateP2trKeyPathTxVbytes(nIn, nOut)
    feeSats = Math.ceil(vbytes * feeRateSatPerVbyte)

    sumIn = inputs.reduce((s, u) => s + u.value, 0)
    change = sumIn - Number(amountSats) - feeSats

    if (change < 0) {
      if (useLocked) throw new Error('Locked UTXOs no longer cover amount and fee. Create a new request.')
      continue
    }

    const tx = new bitcoin.Transaction()
    tx.version = 2
    for (const u of inputs) {
      const hash = Buffer.from(u.txid, 'hex').reverse()
      tx.addInput(hash, u.vout, 0xffffffff)
    }
    tx.addOutput(toScript, Number(amountSats))

    let changeSats = 0n
    if (change > dustSats) {
      tx.addOutput(fromScript, change)
      changeSats = BigInt(change)
    }

    const vbFinal = estimateP2trKeyPathTxVbytes(inputs.length, tx.outs.length)
    const feeFinal = Math.ceil(vbFinal * feeRateSatPerVbyte)
    const change2 = sumIn - Number(amountSats) - feeFinal

    if (change2 < 0) {
      if (useLocked) throw new Error('Locked UTXOs no longer cover amount and fee. Create a new request.')
      continue
    }

    if (change2 > dustSats && tx.outs.length === 1) {
      tx.addOutput(fromScript, change2)
      changeSats = BigInt(change2)
    } else if (change2 <= dustSats && tx.outs.length === 2) {
      tx.outs.pop()
      changeSats = 0n
    } else if (change2 > dustSats && tx.outs.length === 2) {
      tx.outs[1] = { script: fromScript, value: change2 }
      changeSats = BigInt(change2)
    }

    const feeDone = sumIn - Number(amountSats) - Number(changeSats)
    const vbDone = estimateP2trKeyPathTxVbytes(inputs.length, tx.outs.length)
    const minFee = Math.ceil(vbDone * feeRateSatPerVbyte)
    if (feeDone < minFee) {
      if (useLocked) throw new Error('Fee too low for current mempool rules; create a new request with a higher fee.')
      continue
    }

    const val0 = inputs[0]?.value
    if (val0 == null) throw new Error('Missing input value.')
    const prevOutScripts = inputs.map(() => fromScript)
    const values = inputs.map((u) => u.value)
    const sighash = tx.hashForWitnessV1(
      0,
      prevOutScripts,
      values,
      bitcoin.Transaction.SIGHASH_DEFAULT,
    )
    const msgHashHex = Buffer.from(sighash).toString('hex')

    return {
      unsignedTxHex: tx.toHex(),
      msgHashHex,
      feeSats: feeDone,
      feeRateSatPerVbyte,
      changeSats,
      inputCount: inputs.length,
      outputCount: tx.outs.length,
      vbytesEstimate: vbDone,
      selectedUtxos: inputs,
    }
  }

  throw new Error('Could not converge on fee and change.')
}

/** Merge bitcoin transfer fields into extraJSON (string or object). */
export function mergeBitcoinTransferExtraJSON(
  existing: string | Record<string, unknown> | undefined | null,
  patch: Record<string, unknown>,
): string {
  let base: Record<string, unknown> = {}
  if (typeof existing === 'string' && existing.trim()) {
    try {
      const p = JSON.parse(existing) as Record<string, unknown>
      if (p && typeof p === 'object' && !Array.isArray(p)) base = p
    } catch {
      base = {}
    }
  } else if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    base = { ...existing }
  }
  return JSON.stringify({ ...base, ...patch })
}

export type BitcoinTransferPersistedExtra = {
  bitcoinTransfer?: boolean
  bitcoinNetwork?: BitcoinPublicNetwork
  bitcoinScriptType?: BitcoinTransferScriptType
  fromAddress?: string
  amountSats?: string
  amountDisplayUnit?: 'btc' | 'sats'
  selectedUtxos?: EsploraUtxo[]
  knownDestinationName?: string
  /** Compose-time fee tier; Get Sig defaults to this when reopening the request. */
  feeSpeedTier?: BitcoinTransferFeeSpeedTier
  /** When `feeSpeedTier` is `advanced`, explicit sat/vB used at compose (and Get Sig prefill). */
  feeRateSatPerVbyteAdvanced?: string
  bitcoinSecurityCheck?: boolean
}

export function parseBitcoinTransferExtra(json: unknown): BitcoinTransferPersistedExtra | null {
  if (json == null) return null
  let o: Record<string, unknown>
  if (typeof json === 'string') {
    try {
      o = JSON.parse(json) as Record<string, unknown>
    } catch {
      return null
    }
  } else if (typeof json === 'object' && !Array.isArray(json)) {
    o = json as Record<string, unknown>
  } else {
    return null
  }
  if (o.bitcoinTransfer !== true) return null
  const net = o.bitcoinNetwork
  if (net !== 'mainnet' && net !== 'testnet' && net !== 'signet') return null
  const fromAddress = typeof o.fromAddress === 'string' ? o.fromAddress.trim() : ''
  const amountSats = typeof o.amountSats === 'string' ? o.amountSats.trim() : ''
  if (!fromAddress || !amountSats) return null
  const amountDisplayUnit = o.amountDisplayUnit === 'btc' || o.amountDisplayUnit === 'sats' ? o.amountDisplayUnit : undefined
  const selectedUtxos = Array.isArray(o.selectedUtxos) ? (o.selectedUtxos as EsploraUtxo[]) : undefined
  const knownDestinationName =
    typeof o.knownDestinationName === 'string' ? o.knownDestinationName.trim() : ''
  const scriptRaw = o.bitcoinScriptType
  const bitcoinScriptType: BitcoinTransferScriptType | undefined =
    scriptRaw === 'p2tr' || scriptRaw === 'p2wpkh' ? scriptRaw : undefined
  const tierRaw = o.feeSpeedTier
  const feeSpeedTier: BitcoinTransferFeeSpeedTier | undefined =
    tierRaw === 'slow' || tierRaw === 'normal' || tierRaw === 'fast' || tierRaw === 'advanced'
      ? tierRaw
      : undefined
  const feeRateSatPerVbyteAdvanced =
    typeof o.feeRateSatPerVbyteAdvanced === 'string' ? o.feeRateSatPerVbyteAdvanced.trim() : undefined
  return {
    bitcoinTransfer: true,
    bitcoinNetwork: net,
    bitcoinScriptType,
    fromAddress,
    amountSats,
    amountDisplayUnit,
    selectedUtxos,
    knownDestinationName: knownDestinationName || undefined,
    feeSpeedTier,
    feeRateSatPerVbyteAdvanced: feeRateSatPerVbyteAdvanced || undefined,
    bitcoinSecurityCheck: o.bitcoinSecurityCheck === true,
  }
}

/** Conservative MAX send (single largest UTXO, 2-output tx fee estimate). */
export function estimateMaxSendableSatsLargestUtxo(
  utxos: EsploraUtxo[],
  feeRateSatPerVbyte: number,
  scriptType: BitcoinTransferScriptType = 'p2wpkh',
): bigint {
  if (!utxos.length || !Number.isFinite(feeRateSatPerVbyte) || feeRateSatPerVbyte < 1) return 0n
  const best = Math.max(...utxos.map((u) => u.value))
  const vb =
    scriptType === 'p2tr'
      ? estimateP2trKeyPathTxVbytes(1, 2)
      : estimateTxVbytes(1, 2)
  const fee = Math.ceil(vb * feeRateSatPerVbyte)
  return BigInt(Math.max(0, best - fee))
}

export function formatBitcoinAmountForDisplay(satsStr: string, unit: 'btc' | 'sats'): string {
  try {
    const n = BigInt(satsStr.trim())
    if (unit === 'sats') return `${satsStr.trim()} sats`
    const btc = Number(n) / 1e8
    if (!Number.isFinite(btc)) return satsStr
    const t =
      btc >= 1
        ? btc.toFixed(8).replace(/\.?0+$/, '')
        : btc.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })
    return `${t} BTC`
  } catch {
    return satsStr
  }
}

const BITCOIN_SIGN_RESULT_TX_HEX_KEYS = [
  'signedTx',
  'SignedTx',
  'rawTransaction',
  'RawTransaction',
  'serializedTx',
  'SerializedTx',
  'signedRawTx',
  'SignedRawTx',
  'bitcoinSignedTx',
  'BitcoinSignedTx',
  'BitcoinTxHex',
  'bitcoinTxHex',
  'txHex',
  'TxHex',
  'hex',
  'Hex',
  'signedHex',
  'SignedHex',
  /** Nodes often reuse the same field as the proposal after attaching witness signatures. */
  'MessageRaw',
  'messageRaw',
] as const

function collectBitcoinTxHexCandidates(o: Record<string, unknown>, into: unknown[]): void {
  for (const k of BITCOIN_SIGN_RESULT_TX_HEX_KEYS) {
    if (Object.prototype.hasOwnProperty.call(o, k)) into.push(o[k])
  }
}

/**
 * Extract broadcast-ready native SegWit raw tx hex from `getSignResultById` / Execute cache.
 * Requires input 0 to have a witness stack (at least signature + pubkey), so unsigned `MessageRaw`
 * proposals are not mistaken for signed transactions.
 */
export function bitcoinSignedRawTxHexFromSignResult(result: Record<string, unknown> | null | undefined): string | null {
  if (!result || typeof result !== 'object') return null
  const candidates: unknown[] = []
  collectBitcoinTxHexCandidates(result, candidates)
  const nested = result.Data ?? result.data ?? result.payload ?? result.Payload
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    collectBitcoinTxHexCandidates(nested as Record<string, unknown>, candidates)
  }
  const sigdata = result.sigdata ?? result.Sigdata
  if (sigdata && typeof sigdata === 'object' && !Array.isArray(sigdata)) {
    collectBitcoinTxHexCandidates(sigdata as Record<string, unknown>, candidates)
  }
  for (const c of candidates) {
    if (typeof c !== 'string') continue
    const t = c.trim()
    if (!t) continue
    const h = t.replace(/^0x/i, '').trim()
    if (h.length < 40 || h.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(h)) continue
    try {
      const tx = bitcoin.Transaction.fromHex(h)
      const w = tx.ins[0]?.witness
      if (w && w.length >= 2) return h
      if (w && w.length === 1 && w[0]?.length === 64) return h
    } catch {
      continue
    }
  }
  return null
}

const MESSAGE_RAW_HEX_KEYS = ['MessageRaw', 'messageRaw'] as const

function pushMessageRawHexCandidates(
  result: Record<string, unknown> | null | undefined,
  detail: Record<string, unknown> | null | undefined,
  into: unknown[],
): void {
  if (result && typeof result === 'object') {
    for (const k of MESSAGE_RAW_HEX_KEYS) {
      if (Object.prototype.hasOwnProperty.call(result, k)) into.push(result[k])
    }
    const nested = result.Data ?? result.data ?? result.payload ?? result.Payload
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const n = nested as Record<string, unknown>
      for (const k of MESSAGE_RAW_HEX_KEYS) {
        if (Object.prototype.hasOwnProperty.call(n, k)) into.push(n[k])
      }
    }
    const sigdata = result.sigdata ?? result.Sigdata
    if (sigdata && typeof sigdata === 'object' && !Array.isArray(sigdata)) {
      const s = sigdata as Record<string, unknown>
      for (const k of MESSAGE_RAW_HEX_KEYS) {
        if (Object.prototype.hasOwnProperty.call(s, k)) into.push(s[k])
      }
    }
  }
  if (detail && typeof detail === 'object') {
    for (const k of MESSAGE_RAW_HEX_KEYS) {
      if (Object.prototype.hasOwnProperty.call(detail, k)) into.push(detail[k])
    }
  }
}

/**
 * Unsigned proposal tx hex (SegWit v0) from sign result / request detail — witness stacks empty on input 0.
 */
export function bitcoinUnsignedMessageRawTxHexFromSignResultOrDetail(
  result: Record<string, unknown> | null | undefined,
  detail: Record<string, unknown> | null | undefined,
): string | null {
  const candidates: unknown[] = []
  pushMessageRawHexCandidates(result, detail, candidates)
  for (const c of candidates) {
    if (typeof c !== 'string') continue
    const h = c.trim().replace(/^0x/i, '').trim()
    if (h.length < 40 || h.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(h)) continue
    try {
      const tx = bitcoin.Transaction.fromHex(h)
      if (!tx.ins.length) continue
      const w = tx.ins[0].witness
      if (w && w.length > 0) continue
      return h
    } catch {
      continue
    }
  }
  return null
}

function parseScalar32Hex(hex: string): Buffer | null {
  let h = hex.replace(/^0x/i, '').trim().toLowerCase()
  if (!/^[0-9a-f]*$/.test(h) || h.length % 2 !== 0) return null
  if (h.length > 64) return null
  if (h.length < 64) h = h.padStart(64, '0')
  return Buffer.from(h, 'hex')
}

/**
 * Attach P2WPKH witness (DER sig + SIGHASH_ALL, compressed pubkey) to an unsigned v2 SegWit tx.
 * `sigRHex` / `sigSHex` are 32-byte scalars (hex); backend applies low-S normalization before persistence.
 */
export function finalizeP2wpkhTxHexFromUnsignedAndRs(params: {
  unsignedTxHex: string
  sigRHex: string
  sigSHex: string
  pubkeyHex: string
  inputIndex?: number
  fromAddress: string
  network: BitcoinPublicNetwork
}): string {
  const idx = params.inputIndex ?? 0
  const nw = bitcoinJsNetwork(params.network)
  const tx = bitcoin.Transaction.fromHex(params.unsignedTxHex.replace(/^0x/i, '').trim())
  if (idx < 0 || idx >= tx.ins.length) {
    throw new Error('Invalid input index for Bitcoin finalize.')
  }
  const prevWitness = tx.ins[idx].witness
  if (prevWitness && prevWitness.length >= 2) {
    return tx.toHex()
  }

  const pubkey = normalizeSecp256k1PubkeyHexToCompressed(params.pubkeyHex)
  if (!pubkey) throw new Error('Invalid or unsupported secp256k1 public key hex for Bitcoin.')

  let derivedFromPk: string | undefined
  try {
    derivedFromPk = bitcoin.payments.p2wpkh({ pubkey, network: nw }).address
  } catch {
    throw new Error('Could not derive P2WPKH address from public key.')
  }
  const from = params.fromAddress.trim()
  if (!derivedFromPk || !bitcoinAddressesEqual(derivedFromPk, from)) {
    throw new Error(
      'Public key does not match the sender P2WPKH address. Use the same MPC key that owns the from-address.',
    )
  }

  try {
    bitcoin.payments.p2wpkh({ address: from, network: nw })
  } catch {
    throw new Error('Invalid sender P2WPKH address for this network.')
  }

  const rBuf = parseScalar32Hex(params.sigRHex)
  const sBuf = parseScalar32Hex(params.sigSHex)
  if (!rBuf || !sBuf) throw new Error('Invalid signature r/s hex from sign result.')

  const sig64 = Buffer.concat([rBuf, sBuf])
  const witnessSig = bitcoin.script.signature.encode(sig64, bitcoin.Transaction.SIGHASH_ALL)

  tx.ins[idx].witness = [witnessSig, pubkey]
  return tx.toHex()
}

/** Attach key-path P2TR witness (64-byte BIP340 sig) to an unsigned v2 SegWit tx. */
export function finalizeP2trKeyPathTxHexFromUnsignedAndRs(params: {
  unsignedTxHex: string
  sigRHex: string
  sigSHex: string
  inputIndex?: number
}): string {
  const idx = params.inputIndex ?? 0
  const tx = bitcoin.Transaction.fromHex(params.unsignedTxHex.replace(/^0x/i, '').trim())
  if (idx < 0 || idx >= tx.ins.length) {
    throw new Error('Invalid input index for Bitcoin Taproot finalize.')
  }
  const prevWitness = tx.ins[idx].witness
  if (prevWitness && prevWitness.length >= 1 && prevWitness[0]?.length === 64) {
    return tx.toHex()
  }
  const rBuf = parseScalar32Hex(params.sigRHex)
  const sBuf = parseScalar32Hex(params.sigSHex)
  if (!rBuf || !sBuf) throw new Error('Invalid signature r/s hex from sign result.')
  const sig64 = Buffer.concat([rBuf, sBuf])
  tx.ins[idx].witness = [sig64]
  return tx.toHex()
}
