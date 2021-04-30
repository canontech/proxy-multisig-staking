import { ApiPromise, WsProvider } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { KeyringPair } from '@polkadot/keyring/types';
import { Hash, ProxyType } from '@polkadot/types/interfaces';
import {
	createKeyMulti,
	encodeAddress,
	sortAddresses,
} from '@polkadot/util-crypto';

import { devKeys } from './devKeys';
import { logSeperator, waitToContinue } from './util';
const AMOUNT = '123456789012345';
const MAX_WEIGHT = 1_000_000_000_000;

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

	const SS58Prefix = 0;
	const threshold = 2;

	/* Create CancelProxy multisig account and fund address */
	const cancelAddresses = [
		keys.charlie.address,
		keys.dave.address,
		keys.ferdie.address,
	];
	const canceMultiAddr = createKeyMulti(cancelAddresses, threshold);
	const cancelSs58MultiAddr = encodeAddress(canceMultiAddr, SS58Prefix);
	console.log(
		`Cancel multisig address (Charlie+dave+ferdie): ${cancelSs58MultiAddr}`
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
	const addresses = [keys.alice.address, keys.dave.address, keys.bob.address];
	// Address as a byte array.
	const multiAddr = createKeyMulti(addresses, threshold);
	// Convert byte array to SS58 encoding.
	const ss58MultiAddr = encodeAddress(multiAddr, SS58Prefix);
	console.log(`Staking multisig address (Alice+Bob+Dave): ${ss58MultiAddr}`);
	console.log(
		'\nCreating staking multisig account on chain by funding multisig address'
	);
	const { hash: hash2 } = await transferKeepAlive(
		api,
		keys.alice,
		ss58MultiAddr,
		AMOUNT
	);
	console.log(`Staking multisig endowed at block hash: ${hash2.toString()}`);
	logSeperator();
	await waitToContinue();

	/* Add multisig as a staking proxy to Anon account */
	const stakingProxyDelay = 10; // 10 blocks = 1 minute
	const addStakingProxyCall = api.tx.proxy.addProxy(
		ss58MultiAddr,
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
	const aliceApproveAsMulti = api.tx.multisig.approveAsMulti(
		2,
		otherSigs(addresses, keys.alice.address),
		null,
		announceAnonBond.method.hash,
		MAX_WEIGHT
	);
	const { hash: hash4 } = await signAndSend(
		api,
		keys.alice,
		aliceApproveAsMulti
	);
	const timepoint1 = await getTimepoint(
		api,
		hash4.toString(),
		aliceApproveAsMulti.method.hash.toString()
	);
	console.log(
		"Alice's approveAsMulti(announce(bond(Anon))) was included at timepoint: ",
		timepoint1
	);
	logSeperator();
	await waitToContinue();

	const bobAsMulti = api.tx.multisig.asMulti(
		2,
		otherSigs(addresses, keys.bob.address),
		timepoint1,
		announceAnonBond.method.toHex(),
		false,
		MAX_WEIGHT
	);
	const { hash: hash5 } = await signAndSend(api, keys.bob, bobAsMulti);
	console.log(
		`Bob\'s asMulti(announce(bond(Anon))) was executed at block hash: ${hash5.toString()}`
	);

	process.exit(0);
}

/**
 * NOTE IMPORTANT this is not a good way to find a timepoint because there could be multiple of the
 * same tx within a block. This is for demonstration purposes only.
 *
 * Get the timepoint of an extrinsic.
 *
 * @param api
 * @param blockHash
 * @param txHash
 * @returns
 */
async function getTimepoint(
	api: ApiPromise,
	blockHash: string,
	txHash: string
): Promise<{ height: string; index: number }> {
	const {
		block: {
			extrinsics,
			header: { number },
		},
	} = await api.rpc.chain.getBlock(blockHash);
	const index = extrinsics.findIndex(
		(ext) => ext.method.hash.toString() === txHash
	);

	return { height: number.unwrap().toString(10), index };
}

/**
 * Generate `other_signatories` for a multisig transaction..
 *
 * @param addresses list of multisig composite addresses
 * @param signatory the signatory of the multisig transaction
 */
function otherSigs(addresses: string[], signatory: string): string[] {
	const toSort = addresses.filter((addr) => addr !== signatory);
	return sortAddresses(toSort);
}

// TODO maybe iterate through events and display
async function signAndSend(
	api: ApiPromise,
	origin: KeyringPair,
	tx: SubmittableExtrinsic<'promise'>
): Promise<{ hash: Hash }> {
	console.log('Submitting tx:  ', tx.method.toHuman());
	const info: { hash: Hash } = await new Promise((resolve, _reject) => {
		void tx.signAndSend(origin, (r) => {
			if (r.dispatchError) {
				if (r.dispatchError.isModule) {
					// for module errors, we have the section indexed, lookup
					const decoded = api.registry.findMetaError(r.dispatchError.asModule);
					const { documentation, name, section } = decoded;
					const err = `${section}.${name}: ${documentation.join(' ')}`;
					console.log(err);
					throw err;
				} else {
					// Other, CannotLookup, BadOrigin, no extra info
					console.log(r.dispatchError.toString());
					throw r.dispatchError.toString();
				}
			}
			if (r.status.isFinalized) {
				resolve({ hash: r.status.asFinalized });
			}
		});
	});

	return info;
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
