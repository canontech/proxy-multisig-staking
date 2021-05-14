/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { ApiPromise, WsProvider } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { Hash, ProxyType } from '@polkadot/types/interfaces';

import { waitUntilHeight } from './chainSync';
import { devKeys } from './devKeys';
import { logSeperator, waitToContinue } from './display';
import { createAndEndowMulti, executeMultisig, otherSigs } from './multisig';
import { signAndSend } from './signAndSend';

const AMOUNT = '123456789012345';
const THRESHOLD = 2;
const ANNOUNCE_DELAY = 5; // 5 blocks = 30 secs
const STAKING_PROXY = 'Staking';
const CANCEL_PROXY = 'CancelProxy' as unknown as ProxyType; // api does not recognize CancelProxy

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
	console.log(`Anon funding increased at: `, timepoint1);
	logSeperator();
	await waitToContinue();

	/* Create CancelProxy multisig account and fund address */
	console.log('Creating multisig account to be used as Cancel proxy for Anon');
	const cancelComposite = [keys.charlie, keys.dave, keys.ferdie];
	const cancelProxyThreshold = 1; // Only one tx needed to execute calls as multi
	const cancelMultiAddr = await createAndEndowMulti(
		api,
		cancelComposite,
		cancelProxyThreshold,
		AMOUNT
	);

	/* Add multisig as a CancelProxy to Anon */
	const cancelProxyDelay = 0; // NO delay, NO announcements neccesary
	const addCancelProxyCall = api.tx.proxy.addProxy(
		cancelMultiAddr,
		CANCEL_PROXY,
		cancelProxyDelay
	);
	const { timepoint: timepoint3 } = await signAndSend(
		api,
		keys.eve,
		api.tx.proxy.proxy(anonAddr, 'Any', addCancelProxyCall)
	);
	console.log(`Cancel multisig proxy added at: `, timepoint3);
	logSeperator();
	await waitToContinue();

	/* Create Staking multisig address and fund account */
	console.log('Creating multisig account to be used as Staking proxy for Anon');
	// Input the addresses that will make up the multisig account.
	const stakingComposite = [keys.alice, keys.dave, keys.bob];
	// Address as a byte array.
	const stakingMultiAddr = await createAndEndowMulti(
		api,
		stakingComposite,
		THRESHOLD,
		AMOUNT
	);

	/* Add multisig as a staking proxy to Anon account */
	const addStakingProxyCall = api.tx.proxy.addProxy(
		stakingMultiAddr,
		STAKING_PROXY,
		ANNOUNCE_DELAY
	);
	const { timepoint: timepoint5 } = await signAndSend(
		api,
		keys.eve,
		api.tx.proxy.proxy(anonAddr, 'Any', addStakingProxyCall)
	);
	console.log(`Staking multisig added as proxy to Anon at: `, timepoint5);
	logSeperator();
	await waitToContinue();

	/* Use multisig to execute batchAll(staking.bond, staking.setKeys, staking.validate) */
	const anonBond = api.tx.staking.bond(keys.ferdie.address, AMOUNT, {
		Staked: null,
	});
	const sessionKeys = api.createType('Keys', [
		keys.alice.address,
		keys.dave.address,
		keys.dave.address,
		keys.dave.address,
		keys.dave.address,
		keys.dave.address,
	]);
	const anonSetKeys = api.tx.session.setKeys(sessionKeys, '0x');
	const anonValidate = api.tx.staking.validate({
		commission: '100000000', // 100 million in perbill == 10%
		blocked: false,
	});
	const anonStakeBatchAll = api.tx.utility.batchAll([
		anonBond,
		anonSetKeys,
		anonValidate,
	]);

	/* First announce the batchAll(staking.bond, staking.setKeys, staking.validate) */
	const announceAnonBond = api.tx.proxy.announce(
		anonAddr,
		anonStakeBatchAll.method.hash
	);
	const timepointAnnounceAnonBond = await executeMultisig(
		api,
		announceAnonBond,
		stakingComposite,
		2
	);

	const delayEndHeight =
		parseInt(timepointAnnounceAnonBond.height) + ANNOUNCE_DELAY;
	console.log(
		`Waiting for annoucement delay to end at block height ${delayEndHeight}`
	);
	await waitUntilHeight(api, delayEndHeight);

	/* Then execute the staking.bond */
	const proxyAnonBond = api.tx.proxy.proxyAnnounced(
		stakingMultiAddr,
		anonAddr,
		STAKING_PROXY,
		anonStakeBatchAll
	);
	const { timepoint: timepoint6 } = await signAndSend(
		api,
		keys.alice,
		proxyAnonBond
	);
	console.log(
		'Alice executed proxyAnnounced(batchAll(staking.bond, staking.setKeys, staking.validate)) at: ',
		timepoint6
	);

	/* Demonstrate the attack path by making an announcement and then canceling it */
	const changePrefs = api.tx.staking.validate({
		commission: '1000000000',
		blocked: false,
	});
	const announceChangePrefs = api.tx.proxy.announce(
		anonAddr,
		changePrefs.method.hash
	);
	await executeMultisig(api, announceChangePrefs, stakingComposite, 2);

	/**
	 * In reall life we would have a watchdog check on the announcements in chain storage.
	 */
	console.log(
		'****\nThe announcement whatchdog has detected an announcement for an unknown call\n Initating cancel process\n****'
	);

	const rejectAnnouncemnent = api.tx.proxy.rejectAnnouncement(
		stakingMultiAddr,
		changePrefs.method.hash
	);
	const proxyRejectAnnouncement = api.tx.proxy.proxy(
		anonAddr,
		CANCEL_PROXY,
		rejectAnnouncemnent
	);
	const cancelProxyRejectAnnouncement = api.tx.multisig.asMultiThreshold1(
		otherSigs(
			cancelComposite.map(({ address }) => address),
			keys.charlie.address
		),
		proxyRejectAnnouncement
	);
	const { timepoint: cancelTimepoint } = await signAndSend(
		api,
		keys.charlie,
		cancelProxyRejectAnnouncement
	);
	console.log('Announcement succesfully cancelled at: ', cancelTimepoint);

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
			const {
				method: { section, method, args },
			} = tx;
			console.log(
				`Submitting tx:  ${section}.${method}(${args
					.map((a) => JSON.stringify(a.toHuman()))
					.join(', ')})`
			);
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
				if (status.isInBlock) {
					const anonCreated = events.find(({ event }) =>
						api.events.proxy.AnonymousCreated.is(event)
					);
					if (!anonCreated) {
						throw new Error('Expected Anon proxy to be created');
					}
					const anonAddr = anonCreated.event.data[0].toString();
					resovle({
						anonAddr,
						hash: status.asInBlock,
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
