/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { ApiPromise } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { KeyringPair } from '@polkadot/keyring/types';
import {
	createKeyMulti,
	encodeAddress,
	sortAddresses,
} from '@polkadot/util-crypto';

import { Timepoint } from './chainSync';
import { logSeperator, waitToContinue } from './display';
import { signAndSend } from './signAndSend';

const MAX_WEIGHT = 1_000_000_000_000;

/**
 * Generate `other_signatories` for a multisig transaction..
 *
 * @param addresses list of multisig composite addresses
 * @param signatory the signatory of the multisig transaction
 */
export function otherSigs(addresses: string[], signatory: string): string[] {
	const toSort = addresses.filter((addr) => addr !== signatory);
	return sortAddresses(toSort);
}

export async function createAndEndowMulti(
	api: ApiPromise,
	pairs: KeyringPair[],
	threshold: number,
	funding: string
): Promise<string> {
	const multiAddrRaw = createKeyMulti(
		pairs.map(({ address }) => address),
		threshold
	);

	// Create the ss58 encoded address as string.
	const multiAddr = encodeAddress(multiAddrRaw, api.registry.chainSS58);
	console.log(`New multisig address created: ${multiAddr}`);
	console.log(
		`\t with members: ${pairs.map(({ meta: { name } }) => name).join('+')}`
	);
	console.log(
		'Now creating the multisig account on chain by funding the adress'
	);
	const { timepoint } = await signAndSend(
		api,
		pairs[0],
		api.tx.balances.transferKeepAlive(multiAddr, funding)
	);
	console.log(
		`Multisig (${pairs
			.map(({ meta: { name } }) => name)
			.join('+')}) endowed at: `,
		timepoint
	);

	return multiAddr;
}

/**
 * Execute all the steps of a multisig.
 *
 * Executes `threshold - 1` approveAsMulti and 1 asMulti to actually execute
 * `call`.
 *
 * @param api
 * @param call
 * @param keys
 * @param threshold
 * @returns Timepoint the `call` was actually executed
 */
export async function executeMultisig(
	api: ApiPromise,
	call: SubmittableExtrinsic<'promise'>,
	keys: KeyringPair[],
	threshold: number
): Promise<Timepoint> {
	const addresses = keys.map(({ address }) => address);

	let maybeTimepoint = null;
	// Create and send approveAsMulti txs
	let i = 0;
	for (i; i < threshold - 1; i += 1) {
		const approve: SubmittableExtrinsic<'promise'> =
			api.tx.multisig.approveAsMulti(
				2,
				otherSigs(addresses, keys[i].address),
				maybeTimepoint, // This will be null for the first approval
				call.method.hash,
				MAX_WEIGHT
			);

		console.log(
			`${keys[i].meta.name} is sending approveAsMulti(${call.method.section}.${call.method.method})`
		);
		const { timepoint } = await signAndSend(api, keys[i], approve);

		if (i === 0) {
			// This is the first approval tx so we need to get the timepoint and save it
			// so we can refference in the remaining multisig txs
			maybeTimepoint = timepoint;
		}

		console.log(
			`${keys[i].meta.name}'s approveAsMulti(${call.method.section}.${call.method.method}) included at: `,
			timepoint
		);
		logSeperator();
		await waitToContinue();
	}

	// Send the asMulti tx to actually execute the call
	const asMulti = api.tx.multisig.asMulti(
		2,
		otherSigs(addresses, keys[i].address),
		maybeTimepoint,
		call.method.toHex(),
		false,
		MAX_WEIGHT
	);
	console.log(
		`${keys[i].meta.name} is sending asMulti(${call.method.section}.${call.method.method})`
	);
	const { timepoint } = await signAndSend(api, keys[i], asMulti);
	console.log(
		`${keys[i].meta.name}'s asMulti(${call.method.section}.${call.method.method}) included at timepoint: `,
		timepoint
	);
	logSeperator();
	await waitToContinue();

	return timepoint;
}
