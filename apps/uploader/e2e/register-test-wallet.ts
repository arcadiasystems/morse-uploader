/**
 * Runs inside the page (through Playwright's addInitScript) before the app
 * loads, and registers a Wallet Standard wallet. It holds no key: every
 * signature is requested from the test process through an exposed binding,
 * so the private key never enters the browser. It must stay self-contained,
 * because Playwright serializes this function's source into the page.
 */
export interface TestWalletConfig {
	name: string;
	bridge: string;
	authorizedKey: string;
	chains: readonly string[];
	accounts: readonly { address: string; publicKey: string }[];
}

export function registerTestWallet(config: TestWalletConfig): void {
	type Bridge = (request: Record<string, unknown>) => Promise<unknown>;
	type Listener = (properties: { accounts: readonly unknown[] }) => void;

	const bridge = (window as unknown as Record<string, Bridge>)[config.bridge];
	if (!bridge)
		throw new Error(`The test wallet bridge ${config.bridge} is missing.`);
	const call: Bridge = bridge;
	const fromBase64 = (value: string) =>
		Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
	const toBase64 = (bytes: Uint8Array) =>
		btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));

	const accountFeatures = [
		"sui:signTransaction",
		"sui:signPersonalMessage",
	] as const;
	const accounts = config.accounts.map((account) =>
		Object.freeze({
			address: account.address,
			publicKey: fromBase64(account.publicKey),
			chains: config.chains,
			features: accountFeatures,
		}),
	);
	// Like a real wallet, it remembers that this origin was approved.
	let authorized = window.localStorage.getItem(config.authorizedKey) === "yes";
	const listeners = new Set<Listener>();
	const announce = () => {
		for (const listener of listeners)
			listener({ accounts: authorized ? accounts : [] });
	};

	const wallet = Object.freeze({
		version: "1.0.0" as const,
		name: config.name,
		icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiByeD0iNSIgZmlsbD0iIzEyMTQxOCIvPjwvc3ZnPg==" as const,
		chains: config.chains,
		get accounts() {
			return authorized ? accounts : [];
		},
		features: Object.freeze({
			"standard:connect": {
				version: "1.0.0",
				connect: async (input?: { silent?: boolean }) => {
					if (!authorized && input?.silent) return { accounts: [] };
					authorized = true;
					window.localStorage.setItem(config.authorizedKey, "yes");
					await call({ kind: "connect" });
					announce();
					return { accounts };
				},
			},
			"standard:disconnect": {
				version: "1.0.0",
				disconnect: async () => {
					authorized = false;
					window.localStorage.removeItem(config.authorizedKey);
					await call({ kind: "disconnect" });
					announce();
				},
			},
			"standard:events": {
				version: "1.0.0",
				on: (_event: "change", listener: Listener) => {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
			},
			"sui:signTransaction": {
				version: "2.0.0",
				signTransaction: async (input: {
					transaction: { toJSON: () => Promise<string> };
					account: { address: string };
					chain: string;
				}) =>
					call({
						kind: "signTransaction",
						address: input.account.address,
						chain: input.chain,
						transaction: await input.transaction.toJSON(),
					}),
			},
			"sui:signPersonalMessage": {
				version: "1.1.0",
				signPersonalMessage: async (input: {
					message: Uint8Array;
					account: { address: string };
				}) =>
					call({
						kind: "signPersonalMessage",
						address: input.account.address,
						message: toBase64(input.message),
					}),
			},
		}),
	});

	(window as unknown as Record<string, unknown>).__morseE2eTestWallet = wallet;
	const registerWith = (api: {
		register: (registered: typeof wallet) => unknown;
	}) => api.register(wallet);
	window.addEventListener("wallet-standard:app-ready", (event) => {
		registerWith(
			(event as CustomEvent<Parameters<typeof registerWith>[0]>).detail,
		);
	});
	window.dispatchEvent(
		new CustomEvent("wallet-standard:register-wallet", {
			detail: registerWith,
		}),
	);
}
