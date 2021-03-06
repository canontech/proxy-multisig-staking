import { ApiPromise } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { KeyringPair } from '@polkadot/keyring/types';
import type { EventRecord } from '@polkadot/types/interfaces';
import { Hash } from '@polkadot/types/interfaces';

import { Timepoint } from './chainSync';

/**
 * Sign and send a transaction, waiting until it is included in block and returning
 * the transactions timepoint.
 *
 * This will log the events associated with the tx as well.
 *
 * @param api
 * @param origin
 * @param tx
 */
export async function signAndSend(
	api: ApiPromise,
	origin: KeyringPair,
	tx: SubmittableExtrinsic<'promise'>
): Promise<{ hash: Hash; timepoint: Timepoint }> {
	const {
		method: { section, method, args },
	} = tx;
	console.log(
		`Submitting tx:  ${section}.${method}(${args
			.map((a) => JSON.stringify(a.toHuman()))
			.join(', ')})`
	);
	const info: { hash: Hash; timepoint: Timepoint } = await new Promise(
		(resolve, _reject) => {
			void tx.signAndSend(origin, async ({ dispatchError, status, events }) => {
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
					const { number } = await api.rpc.chain.getHeader(status.asInBlock);
					console.log('Events: ');
					events.forEach(
						({
							event: { data, method, section },
							phase,
						}: EventRecord): void => {
							console.log(
								'\t',
								phase.toString(),
								`: ${section}.${method}`,
								data.toString()
							);
						}
					);
					resolve({
						hash: status.asInBlock,
						timepoint: {
							index: events[0].phase.asApplyExtrinsic.toNumber(),
							height: number.unwrap().toString(10),
						},
					});
				}
			});
		}
	);

	return info;
}
