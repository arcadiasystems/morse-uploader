import { FileUp, Unlock, UserPlus, X } from "lucide-react";
import { useEffect } from "react";

const STEPS = [
	{
		icon: UserPlus,
		title: "List the recipients",
		sign: "0 signatures",
		body: "Add the wallet addresses that should be able to decrypt. Your own wallet is always included. Building this list is entirely client-side, so there is no popup per recipient.",
	},
	{
		icon: FileUp,
		title: "Upload the file",
		sign: "2 signatures",
		body: "One to reserve Walrus storage, one to certify the blob and create the file on-chain with its recipient set in a single transaction. Two popups total, no matter how many recipients. You get a share link carrying the file id and decryption key.",
	},
	{
		icon: Unlock,
		title: "Share and decrypt",
		sign: "1 signature to open",
		body: "Anyone can open the link, but Seal checks the file's recipient set on-chain: only recipients get the key. A recipient signs once to start a decrypt session, then no popup per file.",
	},
];

/**
 * Modal explaining the encrypted-sharing flow. Closes on Escape, backdrop
 * click, or the close button. Rendered by the parent which owns the open state.
 */
export function HowItWorks({ onClose }: { onClose: () => void }) {
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div
			className="modal-backdrop"
			role="presentation"
			onClick={(event) => {
				if (event.target === event.currentTarget) {
					onClose();
				}
			}}
		>
			<div
				className="modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="how-title"
			>
				<header className="modal-head">
					<h2 id="how-title" className="modal-title">
						How encrypted sharing works
					</h2>
					<button
						type="button"
						className="icon-btn"
						aria-label="Close"
						onClick={onClose}
					>
						<X size={18} />
					</button>
				</header>

				<p className="muted modal-lede">
					Encryption is gated by a per-file recipient set on Sui. Only the upload
					step costs signatures (2 popups, any number of recipients), so your
					wallet needs a little SUI (gas) and WAL (storage).
				</p>

				<ol className="how-steps">
					{STEPS.map((step, index) => (
						<li className="how-step" key={step.title}>
							<span className="how-step-icon" aria-hidden="true">
								<step.icon size={18} />
							</span>
							<div className="how-step-body">
								<div className="how-step-head">
									<strong>
										{index + 1}. {step.title}
									</strong>
									<span className="how-step-sign">{step.sign}</span>
								</div>
								<p className="muted">{step.body}</p>
							</div>
						</li>
					))}
				</ol>

				<p className="note muted">
					Public uploads skip all of this: no allowlist, no encryption, world
					readable on Walrus.
				</p>
			</div>
		</div>
	);
}
