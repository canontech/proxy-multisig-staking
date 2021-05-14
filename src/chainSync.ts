import { ApiPromise } from '@polkadot/api';

export interface Timepoint {
	height: string;
	index: number;
}

/**
 * Returns a promise that only resolves once the best new block is greater than
 * or equal to the given height
 *
 * @param api
 * @param height
 */
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
