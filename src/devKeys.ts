import { Keyring } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { cryptoWaitReady } from '@polkadot/util-crypto';

export interface DevKeys {
	alice: KeyringPair;
	bob: KeyringPair;
	charlie: KeyringPair;
	dave: KeyringPair;
	eve: KeyringPair;
	ferdie: KeyringPair;
}

export async function devKeys(): Promise<DevKeys> {
	await cryptoWaitReady();
	const devKeys = new Keyring({ type: 'sr25519' });

	return {
		alice: devKeys.addFromUri('//Alice', { name: 'Alice' }),
		bob: devKeys.addFromUri('//Bob', { name: 'Bob' }),
		charlie: devKeys.addFromUri('//Charlie', { name: 'Charlie' }),
		dave: devKeys.addFromUri('//Dave', { name: 'Dave' }),
		eve: devKeys.addFromUri('//Eve', { name: 'Eve' }),
		ferdie: devKeys.addFromUri('//Ferdie', { name: 'Ferdie' }),
	};
}
