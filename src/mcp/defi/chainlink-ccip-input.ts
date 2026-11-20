import { getAddress } from 'viem'
import type { NodeSdkConfig } from '../../config/schema.js'
import { fetchKeyGenResult } from '../../core/keygen.js'
import { parseKeyGenRequestId } from '../../core/keygen-id.js'
import { resolveChainRegistryEntry } from '../../core/registry/networks.js'
import type { SdkResult } from '../../core/result.js'
import { parseEvmChainId } from './input-adapter.js'

const CCIP_FEE_TOOL = 'ctm_ccip_fetch_send_fee'

export function isCcipFeeReadTool(toolName: string): boolean {
  return toolName === CCIP_FEE_TOOL
}

/** Inject source-chain rpcUrl and, when recipient is omitted, the KeyGen address. */
export async function adaptCcipFeeReadMcpInput(
  config: NodeSdkConfig,
  toolName: string,
  input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
  if (!isCcipFeeReadTool(toolName)) return { ok: true, data: input }
  const adapted: Record<string, unknown> = { ...input }
  const chainId = parseEvmChainId(adapted.chainId)
  if (!Number.isFinite(chainId) || chainId <= 0) {
    return { ok: false, reason: 'chainId must be a positive EVM chain id.' }
  }
  adapted.chainId = chainId
  const rpcProvided = typeof adapted.rpcUrl === 'string' && adapted.rpcUrl.trim() ? adapted.rpcUrl.trim() : ''
  if (!rpcProvided) {
    const chain = await resolveChainRegistryEntry(config, chainId)
    if (!chain.ok) return chain
    const rpcUrl = String(chain.data.rpcGateway ?? '').trim()
    if (!rpcUrl) {
      return {
        ok: false,
        reason: `Chain registry entry for chainId ${chainId} has no rpcGateway. Configure it via get_chain_registry / add_to_chain_registry.`,
      }
    }
    adapted.rpcUrl = rpcUrl
  }
  const recipient = typeof adapted.recipient === 'string' ? adapted.recipient.trim() : ''
  if (!recipient) {
    const keyGenIdRaw = typeof adapted.keyGenId === 'string' ? adapted.keyGenId.trim() : ''
    if (!keyGenIdRaw) {
      return { ok: false, reason: 'Pass recipient or keyGenId so the CCIP fee quote has a destination address.' }
    }
    const keyGenId = parseKeyGenRequestId(keyGenIdRaw)
    if (!keyGenId.ok) return keyGenId
    const kg = await fetchKeyGenResult(config, keyGenId.data)
    if (!kg.ok) return kg
    const eth = String(kg.data.ethereumaddress ?? '').trim()
    if (!eth) return { ok: false, reason: 'KeyGen result is missing ethereumaddress.' }
    adapted.recipient = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`)
  }
  return { ok: true, data: adapted }
}
