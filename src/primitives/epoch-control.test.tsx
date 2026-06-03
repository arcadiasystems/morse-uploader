import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EpochControl } from "./epoch-control.js";

describe("EpochControl", () => {
	it("increments and decrements", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		render(<EpochControl value={5} onChange={onChange} min={1} max={10} />);
		await user.click(screen.getByRole("button", { name: "Increase epochs" }));
		expect(onChange).toHaveBeenCalledWith(6);
		onChange.mockClear();
		await user.click(screen.getByRole("button", { name: "Decrease epochs" }));
		expect(onChange).toHaveBeenCalledWith(4);
	});

	it("disables decrement at min and increment at max", () => {
		const { rerender } = render(
			<EpochControl value={1} onChange={vi.fn()} min={1} max={10} />,
		);
		expect(
			(
				screen.getByRole("button", {
					name: "Decrease epochs",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		rerender(<EpochControl value={10} onChange={vi.fn()} min={1} max={10} />);
		expect(
			(
				screen.getByRole("button", {
					name: "Increase epochs",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	it("clamps a typed value to the max", () => {
		const onChange = vi.fn();
		render(<EpochControl value={5} onChange={onChange} min={1} max={10} />);
		fireEvent.change(screen.getByRole("spinbutton"), {
			target: { value: "99" },
		});
		expect(onChange).toHaveBeenCalledWith(10);
	});

	it("selects a preset", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		render(<EpochControl value={5} onChange={onChange} presets={[12, 50]} />);
		await user.click(screen.getByRole("button", { name: "50" }));
		expect(onChange).toHaveBeenCalledWith(50);
	});
});
