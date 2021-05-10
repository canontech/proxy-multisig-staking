import { ApiPromise, WsProvider } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { Hash, ProxyType } from '@polkadot/types/interfaces';
import { createKeyMulti, encodeAddress } from '@polkadot/util-crypto';

import { devKeys } from './devKeys';
import { executeMultiSig } from './executeMultiSig';
import { logSeperator, signAndSend, waitToContinue } from './util';
const AMOUNT = '123456789012345';
const THRESHOLD = 2;

async function main() {
	// Initialise the provider to connect to the local node
	const provider = new WsProvider('ws://127.0.0.1:9944');
	// Create the API and wait until ready
	const api = await ApiPromise.create({ provider });
	// Load our development key pairs
	const keys = await devKeys();

	/* Create the anon proxy and extract its address from tx events */
	const { anonAddr, hash: hash0 } = await createAnon(api, keys.eve);
	console.log(`Anon created at block hash: ${hash0.toString()}`);
	console.log(`The Anon address is ${anonAddr}`);
	console.log(`\nFund the Anon account so we can bond something later`);
	const { hash: hash1 } = await transferKeepAlive(
		api,
		keys.ferdie,
		anonAddr,
		AMOUNT
	);
	console.log(`Anon funding increased at block hash: ${hash1.toString()}`);
	logSeperator();
	await waitToContinue();

	/* Create CancelProxy multisig account and fund address */
	const cancelComposite = [keys.charlie, keys.dave, keys.ferdie];
	const canceMultiAddr = createKeyMulti(
		cancelComposite.map(({ address }) => address),
		THRESHOLD
	);
	const cancelSs58MultiAddr = encodeAddress(
		canceMultiAddr,
		api.registry.chainSS58
	);
	console.log(
		`Cancel multisig address (Charlie+Dave+Ferdie): ${cancelSs58MultiAddr}`
	);
	console.log(
		'\nCreating Cancel multisig account on chain by funding Cancel multisig address'
	);
	const { hash: hashX } = await transferKeepAlive(
		api,
		keys.charlie,
		cancelSs58MultiAddr,
		AMOUNT
	);
	console.log(`Cancel multisig endowed at block hash: ${hashX.toString()}`);

	/* Add multisig as a CancelProxy to Anon */
	const cancelProxyDelay = 0; // NO delay, NO announcements neccesary
	const addCancelProxyCall = api.tx.proxy.addProxy(
		cancelSs58MultiAddr,
		('CancelProxy' as unknown) as ProxyType, // api does not recognize CancelProxy
		cancelProxyDelay
	);
	const { hash: hashY } = await signAndSend(
		api,
		keys.eve,
		api.tx.proxy.proxy(anonAddr, 'Any', addCancelProxyCall)
	);
	console.log(`Cancel multisig proxy added at block hash: ${hashY.toString()}`);
	logSeperator();
	await waitToContinue();

	/* Create Staking multisig address and fund account */
	// Input the addresses that will make up the multisig account.
	const stakingComposite = [keys.alice, keys.dave, keys.bob];
	// Address as a byte array.
	const stakingCompositeAddr = createKeyMulti(
		stakingComposite.map(({ address }) => address),
		THRESHOLD
	);
	// Convert byte array to SS58 encoding.
	const ss58StakingCompositeAddr = encodeAddress(
		stakingCompositeAddr,
		api.registry.chainSS58
	);
	console.log(
		`Staking multisig address (Alice+Bob+Dave): ${ss58StakingCompositeAddr}`
	);
	console.log(
		'\nCreating staking multisig account on chain by funding multisig address'
	);
	const { hash: hash2 } = await transferKeepAlive(
		api,
		keys.alice,
		ss58StakingCompositeAddr,
		AMOUNT
	);
	console.log(`Staking multisig endowed at block hash: ${hash2.toString()}`);
	logSeperator();
	await waitToContinue();

	/* Add multisig as a staking proxy to Anon account */
	const stakingProxyDelay = 10; // 10 blocks = 1 minute
	const addStakingProxyCall = api.tx.proxy.addProxy(
		ss58StakingCompositeAddr,
		'Staking',
		stakingProxyDelay
	);
	const { hash: hash3 } = await signAndSend(
		api,
		keys.eve,
		api.tx.proxy.proxy(anonAddr, 'Any', addStakingProxyCall)
	);
	console.log(
		`Staking multisig proxy added at block hash: ${hash3.toString()}`
	);
	logSeperator();
	await waitToContinue();

	/* Use multisig to execute staking.bond */
	const anonBond = api.tx.staking.bond(keys.ferdie.address, AMOUNT, {
		Staked: null,
	});
	const announceAnonBond = api.tx.proxy.announce(
		anonAddr,
		anonBond.method.hash
	);
	await executeMultiSig(api, announceAnonBond, stakingComposite, 2);

	process.exit(0);
}

async function createAnon(
	api: ApiPromise,
	alice: KeyringPair
): Promise<{ anonAddr: string; hash: Hash }> {
	const anonProxyDelay = 0;
	const anonProxyIndex = 0;

	const info: { anonAddr: string; hash: Hash } = await new Promise(
		(resovle, _reject) => {
			const tx = api.tx.proxy.anonymous('Any', anonProxyDelay, anonProxyIndex);
			console.log('Submitting tx:  ', tx.method.toHuman());
			void tx.signAndSend(alice, ({ status, events, dispatchError }) => {
				if (dispatchError) {
					if (dispatchError.isModule) {
						// for module errors, we have the section indexed, lookup
						const decoded = api.registry.findMetaError(dispatchError.asModule);
						const { documentation, name, section } = decoded;
						const err = `${section}.${name}: ${documentation.join(' ')}`;
						console.log(err);
						throw err;
					} else {
						// Other, CannotLookup, BadOrigin, no extra info
						console.log(dispatchError.toString());
						throw dispatchError.toString();
					}
				}
				if (status.isFinalized) {
					const anonCreated = events.find(({ event }) =>
						api.events.proxy.AnonymousCreated.is(event)
					);
					if (!anonCreated) {
						throw new Error('Expected Anon proxy to be created');
					}
					const anonAddr = anonCreated.event.data[0].toString();
					resovle({
						anonAddr,
						hash: status.asFinalized,
					});
				}
			});
		}
	);

	return info;
}

// TODO can just use signAndSend instead
async function transferKeepAlive(
	api: ApiPromise,
	origin: KeyringPair,
	to: string,
	amount: string
): Promise<{ hash: Hash }> {
	const info: { hash: Hash } = await new Promise((resolve, _reject) => {
		const tx = api.tx.balances.transferKeepAlive(to, amount);
		console.log('Submitting tx:  ', tx.method.toHuman());
		void tx.signAndSend(origin, ({ status, dispatchError }) => {
			if (dispatchError) {
				// TODO this dispatch error section can be dried up
				if (dispatchError.isModule) {
					// for module errors, we have the section indexed, lookup
					const decoded = api.registry.findMetaError(dispatchError.asModule);
					const { documentation, name, section } = decoded;
					const err = `${section}.${name}: ${documentation.join(' ')}`;
					console.log(err);
					throw err;
				} else {
					// Other, CannotLookup, BadOrigin, no extra info
					console.log(dispatchError.toString());
					throw dispatchError.toString();
				}
			}
			if (status.isFinalized) {
				resolve({ hash: status.asFinalized });
			}
		});
	});

	return info;
}

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
