import { ApiPromise } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import {
	createKeyMulti,
	encodeAddress,
	sortAddresses,
} from '@polkadot/util-crypto';

import { signAndSend } from './tx';

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
