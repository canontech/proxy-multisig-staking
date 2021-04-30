import { Keyring } from "@polkadot/api";
import { cryptoWaitReady } from '@polkadot/util-crypto';

export async function devKeys() {
	await cryptoWaitReady();
	const devKeys = new Keyring({ type: 'sr25519' });

	return {
		alice: devKeys.addFromUri('//Alice', { name: 'Alice' }),
		bob: devKeys.addFromUri('//Bob', { name: 'Bob' }),
		charlie: devKeys.addFromUri('//Charlie', { name: 'Charlie' }),
		dave: devKeys.addFromUri('//Dave', { name: 'Dave' }),
		eve: devKeys.addFromUri('//Eve', { name: 'Eve' }),
		ferdie: devKeys.addFromUri('//Ferdie', { name: 'Ferdie' })
	};
};
