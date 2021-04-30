import readline from 'readline';

export function logSeperator(): void {
	console.log(Array(80).fill('━').join(''), '\n');
}

export function submiting(): void {
	console.log('...submiting transaction to the node 🚀');
}

export function waiting(): void {
	console.log('...waiting for transaction inclusion ⌛️⌛⌛️');
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
