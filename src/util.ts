import { ApiPromise } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { KeyringPair } from '@polkadot/keyring/types';
import { Hash } from '@polkadot/types/interfaces';
import { sortAddresses } from '@polkadot/util-crypto';
import readline from 'readline';

export function logSeperator(): void {
	console.log(Array(80).fill('━').join(''), '\n');
}

export function waitToContinue(): Promise<void> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve, _reject) => {
		rl.question('Press enter to continue:\n', (_answer) => {
			console.log(_answer);
			rl.close();
			resolve(undefined);
		});
	});
}

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

/**
 * WARNING this can be incorrect because there could be multiple of the
 * same tx within a block.
 *
 * Get the timepoint of an extrinsic.
 *
 * @param api
 * @param blockHash
 * @param txHash
 * @returns
 */
export async function getTimepoint(
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

// TODO maybe iterate through events and display
export async function signAndSend(
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
