import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dropzone } from "./dropzone.js";

function file(name = "a.txt"): File {
	return new File(["x"], name, { type: "text/plain" });
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Dropzone", () => {
	it("renders as an accessible button and reflects drag state to the child", () => {
		const { container } = render(
			<Dropzone onFiles={vi.fn()} label="Upload files">
				{({ isDragging }) => <span>{isDragging ? "drag" : "idle"}</span>}
			</Dropzone>,
		);
		const zone = screen.getByRole("button", { name: "Upload files" });
		expect(zone.getAttribute("tabindex")).toBe("0");
		expect(screen.getByText("idle")).toBeTruthy();

		fireEvent.dragEnter(zone, { dataTransfer: { files: [] } });
		expect(zone.getAttribute("data-dragging")).toBe("true");
		expect(screen.getByText("drag")).toBeTruthy();

		fireEvent.dragLeave(zone, { dataTransfer: { files: [] } });
		expect(screen.getByText("idle")).toBeTruthy();
		expect(container.querySelector("input[type=file]")).toBeTruthy();
	});

	it("opens the file dialog on click and on keyboard activation", async () => {
		const user = userEvent.setup();
		const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
		render(<Dropzone onFiles={vi.fn()} label="Upload" />);
		const zone = screen.getByRole("button", { name: "Upload" });

		await user.click(zone);
		expect(clickSpy).toHaveBeenCalledTimes(1);

		zone.focus();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");
		expect(clickSpy).toHaveBeenCalledTimes(3);

		// A non-activating key does nothing.
		fireEvent.keyDown(zone, { key: "Escape" });
		expect(clickSpy).toHaveBeenCalledTimes(3);
	});

	it("forwards accept and multiple to the input", () => {
		const { container } = render(
			<Dropzone
				onFiles={vi.fn()}
				label="Upload"
				accept="image/*"
				multiple={false}
			/>,
		);
		const input = container.querySelector(
			"input[type=file]",
		) as HTMLInputElement;
		expect(input.getAttribute("accept")).toBe("image/*");
		expect(input.multiple).toBe(false);
	});

	it("stays idle on drag events when disabled", () => {
		render(<Dropzone onFiles={vi.fn()} label="Upload" disabled />);
		const zone = screen.getByRole("button", { name: "Upload" });
		fireEvent.dragEnter(zone, { dataTransfer: { files: [] } });
		fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
		fireEvent.dragLeave(zone, { dataTransfer: { files: [] } });
		expect(zone.getAttribute("data-dragging")).toBeNull();
	});

	it("emits files chosen from the file input", async () => {
		const onFiles = vi.fn();
		const user = userEvent.setup();
		const { container } = render(<Dropzone onFiles={onFiles} label="Upload" />);
		const input = container.querySelector(
			"input[type=file]",
		) as HTMLInputElement;

		await user.upload(input, file("report.pdf"));
		expect(onFiles).toHaveBeenCalledWith([
			expect.objectContaining({ name: "report.pdf" }),
		]);
	});

	it("emits files from a drop", () => {
		const onFiles = vi.fn();
		render(<Dropzone onFiles={onFiles} label="Upload" />);
		const zone = screen.getByRole("button", { name: "Upload" });

		fireEvent.drop(zone, { dataTransfer: { files: [file("dropped.txt")] } });
		expect(onFiles).toHaveBeenCalledWith([
			expect.objectContaining({ name: "dropped.txt" }),
		]);
	});

	it("ignores interaction when disabled", async () => {
		const onFiles = vi.fn();
		const user = userEvent.setup();
		const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
		render(<Dropzone onFiles={onFiles} label="Upload" disabled />);
		const zone = screen.getByRole("button", { name: "Upload" });

		expect(zone.getAttribute("tabindex")).toBe("-1");
		expect(zone.getAttribute("aria-disabled")).toBe("true");
		await user.click(zone);
		fireEvent.drop(zone, { dataTransfer: { files: [file()] } });
		expect(clickSpy).not.toHaveBeenCalled();
		expect(onFiles).not.toHaveBeenCalled();
	});
});
