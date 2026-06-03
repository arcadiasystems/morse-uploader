import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressIndicator } from "./progress-indicator.js";

describe("ProgressIndicator", () => {
	it("renders the default phase label", () => {
		render(<ProgressIndicator phase="uploading" status="uploading" />);
		expect(screen.getByRole("status").textContent).toBe("Uploading...");
	});

	it("renders nothing when there is no phase", () => {
		const { container } = render(
			<ProgressIndicator phase={null} status="idle" />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("uses a custom label", () => {
		render(
			<ProgressIndicator
				phase="complete"
				status="success"
				labels={{ complete: "Done!" }}
			/>,
		);
		expect(screen.getByText("Done!")).toBeTruthy();
	});
});
