import { toSuiAddress } from "@arcadiasystems/morse-sdk";
import type { CompletedFileUpload } from "@arcadiasystems/morse-uploader";
import { MorseFileUploader } from "@arcadiasystems/morse-uploader/ui";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { FileUp, HelpCircle, Lock, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Example home. A master "Encrypt" toggle reveals a "Who can access?" recipient
 * list; the connected wallet is always included (auto-added on chain). When the
 * toggle is off, the upload is public. The package uploader does the work in two
 * wallet popups regardless of recipient count.
 */
export function Studio({ onShowHelp }: { onShowHelp: () => void }) {
	const account = useCurrentAccount();
	const [encrypt, setEncrypt] = useState(false);
	const [recipients, setRecipients] = useState<string[]>([]);
	const [draft, setDraft] = useState("");

	const addRecipient = () => {
		const value = draft.trim();
		if (value === "") {
			return;
		}
		let normalized: string;
		try {
			normalized = toSuiAddress(value);
		} catch {
			toast.error("That does not look like a Sui address");
			return;
		}
		if (recipients.includes(normalized) || normalized === account?.address) {
			setDraft("");
			return;
		}
		setRecipients((current) => [...current, normalized]);
		setDraft("");
	};

	const removeRecipient = (value: string) => {
		setRecipients((current) => current.filter((item) => item !== value));
	};

	const handleUploaded = (result: CompletedFileUpload) => {
		toast.success(
			result.encrypted ? "Encrypted file uploaded" : "File uploaded",
			{ description: "Open the share link in the result panel below." },
		);
	};

	return (
		<div className="studio">
			<div className="toggle-bar">
				<div className="toggle-copy">
					<strong>
						<ShieldCheck size={16} /> Encrypt this file
					</strong>
					<p className="muted">
						Only the recipients you list can decrypt. Off uploads a public file
						to Walrus.{" "}
						<button type="button" className="link-btn" onClick={onShowHelp}>
							<HelpCircle size={13} /> How it works
						</button>
					</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={encrypt}
					aria-label="Encrypt this file"
					className={`switch ${encrypt ? "switch-on" : ""}`}
					onClick={() => setEncrypt((value) => !value)}
				>
					<span className="switch-knob" />
				</button>
			</div>

			{encrypt ? (
				<section className="card reveal">
					<div className="step-head">
						<span className="step-badge">1</span>
						<h2 className="card-title">
							<Lock size={16} /> Who can access?
						</h2>
					</div>
					<p className="muted">
						Add recipient wallet addresses. Your own wallet is always included,
						so you can always decrypt. No signature is needed to build this
						list.
					</p>

					<div className="chips">
						<span className="chip chip-on" title={account?.address}>
							<Lock size={14} /> You (always)
						</span>
						{recipients.map((member) => (
							<span className="chip" key={member} title={member}>
								{`${member.slice(0, 10)}...`}
								<button
									type="button"
									className="chip-x"
									aria-label={`Remove ${member}`}
									onClick={() => removeRecipient(member)}
								>
									<X size={12} />
								</button>
							</span>
						))}
					</div>

					<form
						className="create-row"
						onSubmit={(event) => {
							event.preventDefault();
							addRecipient();
						}}
					>
						<input
							className="text-input"
							type="text"
							placeholder="0x... recipient address"
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
						/>
						<button type="submit" className="btn">
							Add
						</button>
					</form>
				</section>
			) : null}

			<section className="card">
				<div className="step-head">
					<span className="step-badge">{encrypt ? "2" : "1"}</span>
					<h2 className="card-title">
						<FileUp size={16} /> Upload a file
					</h2>
				</div>
				<MorseFileUploader
					encrypt={encrypt}
					recipients={recipients as never}
					onUploaded={handleUploaded}
				/>
			</section>
		</div>
	);
}
