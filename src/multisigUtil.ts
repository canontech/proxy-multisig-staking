import { sortAddresses } from '@polkadot/util-crypto';

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
