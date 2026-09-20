export const CONTINUUMDAO_API_DEFAULT_BASE = 'https://app-api.continuumdao.org';

export const CONTINUUMDAO_API_USER_AGENT =
	'ContinuumDaoTokenomics/1.0 (+https://github.com/ContinuumDAO/continuum-node-sdk)';

export const CTM_DECIMALS = 18;
export const CTM_MAX_SUPPLY_CTM = '100000000';

export const ETHEREUM_CHAIN_ID = 1;
export const LINEA_CHAIN_ID = 59144;

export const ETHERSCAN_EXPLORER_BASE = 'https://etherscan.io';

export const CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID = 'continuumdao-tokenomics';

export const ETHERSCAN_MCP_SERVER_ID = 'etherscan';
export const ETHERSCAN_COMMUNITY_MCP_SERVER_ID = 'etherscan-community';
export const ETHERSCAN_API_KEY_ENV = 'ETHERSCAN_API_KEY';

export const CIRCULATING_SUPPLY_FORMULA =
	'globalSupply − (CTM.balanceOf(veCTM) + CTM.balanceOf(Linea treasury))';

export const CIRCULATING_SUPPLY_NOTE =
	'API circulatingSupply is unlocked CTM outside the Linea treasury (crawler formula). It is not the White Paper figure (“circulating, all locked in veCTM”). Do not mix the two.';

export const MAX_SUPPLY_NOTE =
	'100 million CTM (White Paper / CTMMintable.maxSupply). Not returned by GET /metrics.';

export const ALLOCATION_NOTE =
	'White Paper allocation (narrative, not live percentages from /metrics): Treasury 45%, Ecosystem 15%, Core 13–15%, Airdrop 10%, Investors 15%. Use search_continuum_docs for the official text.';

export const TOKENS_IDS_BATCH_MAX = 50;
export const LOCKED_ADDRESSES_MAX = 25;

export const FETCH_TIMEOUT_MS = 15_000;
