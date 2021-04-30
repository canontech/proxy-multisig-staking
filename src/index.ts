import { ApiPromise, WsProvider } from '@polkadot/api'

import { devKeys } from './devKeys';

async function main() {
	// Initialise the provider to connect to the local node
	const provider = new WsProvider('ws://127.0.0.1:9944');
	// Create the API and wait until ready
	const api = await ApiPromise.create({ provider });
	// Load our development key pairs
	const keys = await devKeys();

	const anonProxyDelay = 0;
	const anonProxyIndex = 0;

	/* Create the anon proxy and extract its address from tx events */
	const anonAddress = await new Promise((resovle, _reject) => {
		api.tx.proxy
			.anonymous('Any', anonProxyDelay, anonProxyIndex)
			.signAndSend(keys.alice, ({ status, events }) => {
				if (status.isInBlock || status.isFinalized) {
					console.log(status.toString());
					const anonCreated = events.find(({ event }) => api.events.proxy.AnonymousCreated.is(event));
					if (!anonCreated) {
						throw new Error('Expected Anon proxy to be created')
					}
					const anonAddress = anonCreated.event.data[0].toString() as string;
					resovle(anonAddress)
				}
			})
	})


	console.log('The Anon address is: ', anonAddress);
}



main().catch((error) => {
	console.error(error);
	process.exit(-1);
});