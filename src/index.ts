/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { ApiPromise, WsProvider } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { Hash, ProxyType } from '@polkadot/types/interfaces';
import { createKeyMulti, encodeAddress } from '@polkadot/util-crypto';

import { waitUntilHeight } from './chainSync';
import { devKeys } from './devKeys';
import { logSeperator, waitToContinue } from './display';
import { executeMultisig } from './executeMultisig';
import { signAndSend } from './tx';

const AMOUNT = '123456789012345';
const THRESHOLD = 2;
const ANNOUNCE_DELAY = 5; // 5 blocks = 30 secs

async function main() {
	// Initialise the provider to connect to the local node
	const provider = new WsProvider('ws://127.0.0.1:9944');
	// Create the API and wait until ready
	const api = await ApiPromise.create({ provider });
	// Load our development key pairs
	const keys = await devKeys();

	/* Create the anon proxy and extract its address from tx events */
	const { anonAddr, hash: hash0 } = await createAnon(api, keys.eve);
	console.log(`Anon created at: ${hash0.toString()}`);
	console.log(`The Anon address is ${anonAddr}`);
	console.log(`\nFund the Anon account so we can bond something later`);
	const { timepoint: timepoint1 } = await signAndSend(
		api,
		keys.ferdie,
		api.tx.balances.transferKeepAlive(anonAddr, AMOUNT)
	);
	console.log(`Anon funding increased at: ${timepoint1.toString()}`);
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
	const { timepoint: timepoint2 } = await signAndSend(
		api,
		keys.charlie,
		api.tx.balances.transferKeepAlive(cancelSs58MultiAddr, AMOUNT)
	);
	console.log(`Cancel multisig endowed at: ${timepoint2}`);

	/* Add multisig as a CancelProxy to Anon */
	const cancelProxyDelay = 0; // NO delay, NO announcements neccesary
	const addCancelProxyCall = api.tx.proxy.addProxy(
		cancelSs58MultiAddr,
		('CancelProxy' as unknown) as ProxyType, // api does not recognize CancelProxy
		cancelProxyDelay
	);
	const { timepoint: timepoint3 } = await signAndSend(
		api,
		keys.eve,
		api.tx.proxy.proxy(anonAddr, 'Any', addCancelProxyCall)
	);
	console.log(`Cancel multisig proxy added at: ${timepoint3}`);
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
	const { timepoint: timepoint4 } = await signAndSend(
		api,
		keys.alice,
		api.tx.balances.transferKeepAlive(ss58StakingCompositeAddr, AMOUNT)
	);
	console.log(`Staking multisig endowed at: ${timepoint4}`);
	logSeperator();
	await waitToContinue();

	/* Add multisig as a staking proxy to Anon account */

	const addStakingProxyCall = api.tx.proxy.addProxy(
		ss58StakingCompositeAddr,
		'Staking',
		ANNOUNCE_DELAY
	);
	const { timepoint: timepoint5 } = await signAndSend(
		api,
		keys.eve,
		api.tx.proxy.proxy(anonAddr, 'Any', addStakingProxyCall)
	);
	console.log(`Staking multisig proxy added at: ${timepoint5}`);
	logSeperator();
	await waitToContinue();

	/* Use multisig to execute staking.bond */
	const anonBond = api.tx.staking.bond(keys.ferdie.address, AMOUNT, {
		Staked: null,
	});

	/* First announce the staking.bond */
	const announceAnonBond = api.tx.proxy.announce(
		anonAddr,
		anonBond.method.hash
	);
	const timepointAnnouncAnonBond = await executeMultisig(
		api,
		announceAnonBond,
		stakingComposite,
		2
	);

	const delayEndHeight =
		parseInt(timepointAnnouncAnonBond.height) + ANNOUNCE_DELAY;
	console.log(
		`Waiting for annoucement delay to end at block height ${delayEndHeight}`
	);
	await waitUntilHeight(api, delayEndHeight);

	/* Then execute the staking.bond */
	const proxyAnonBond = api.tx.proxy.proxy(
		anonAddr,
		'Staking',
		anonBond.method.hash
	);
	await executeMultisig(api, proxyAnonBond, stakingComposite, 2);

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

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
