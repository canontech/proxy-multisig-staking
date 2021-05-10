/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { ApiPromise } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { KeyringPair } from '@polkadot/keyring/types';

import {
	getTimepoint,
	logSeperator,
	otherSigs,
	signAndSend,
	waitToContinue,
} from './util';

const MAX_WEIGHT = 1_000_000_000_000;

export async function executeMultiSig(
	api: ApiPromise,
	call: SubmittableExtrinsic<'promise'>,
	keys: KeyringPair[],
	threshold: number
): Promise<void> {
	const addresses = keys.map(({ address }) => address);

	let maybeTimepoint = null;
	// Create and send approveAsMulti txs
	let i = 0;
	for (i; i < threshold - 1; i += 1) {
		const approve: SubmittableExtrinsic<'promise'> = api.tx.multisig.approveAsMulti(
			2,
			otherSigs(addresses, keys[i].address),
			maybeTimepoint, // This will be null for the first approval
			call.method.hash,
			MAX_WEIGHT
		);

		console.log(
			`${keys[i].meta.name} is sending approveAsMulti(${call.method.section}.${call.method.method})`
		);
		const { hash } = await signAndSend(api, keys[i], approve);

		if (i === 0) {
			// This is the first approval tx so we need to get the timepoint and save it
			// so we can refference in the remaining multisig txs
			maybeTimepoint = await getTimepoint(
				api,
				hash.toString(),
				approve.method.hash.toHex()
			);
		}

		console.log(
			`${keys[i].meta.name}'s approveAsMulti(${call.method.section}.${
				call.method.method
			}) included at block hash: ${hash.toHex()}`
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
	const { hash } = await signAndSend(api, keys[i], asMulti);
	console.log(
		`${keys[i].meta.name}'s asMulti(${call.method.section}.${
			call.method.method
		}) included at block hash: ${hash.toHex()}`
	);
	logSeperator();
	await waitToContinue();
}
