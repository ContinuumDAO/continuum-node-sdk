import {createContinuumMcpServer} from '../register.js';
import {nodeSdkConfigFromEnv} from './config-from-env.js';
import {startHttpTransportServer} from './http-transport.js';

async function main(): Promise<void> {
	const config = nodeSdkConfigFromEnv();
	await startHttpTransportServer(() => createContinuumMcpServer(config));
}

main().catch(error => {
	console.error('Fatal error in main():', error);
	process.exit(1);
});
