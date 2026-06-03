import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EncryptToggle } from "./encrypt-toggle.js";

describe("EncryptToggle", () => {
	it("calls onChange with the next checked state", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		render(
			<EncryptToggle
				checked={false}
				onChange={onChange}
				label="Encrypt files"
			/>,
		);
		await user.click(screen.getByLabelText("Encrypt files"));
		expect(onChange).toHaveBeenCalledWith(true);
	});

	it("does not fire when disabled", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		render(
			<EncryptToggle
				checked={false}
				onChange={onChange}
				label="Encrypt files"
				disabled
			/>,
		);
		await user.click(screen.getByLabelText("Encrypt files"));
		expect(onChange).not.toHaveBeenCalled();
	});
});
