// Chain monitoring tools

import { ApiPromise } from '@polkadot/api';

export interface Timepoint {
	height: string;
	index: number;
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
): Promise<Timepoint> {
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

export async function waitUntilHeight(
	api: ApiPromise,
	height: number
): Promise<void> {
	return new Promise((resolve, _reject) => {
		void api.rpc.chain.subscribeNewHeads(({ number }) => {
			if (number.unwrap().gten(height)) {
				resolve();
			}
		});
	});
}
