import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WriteModeSettings } from "./write-mode-settings.js";

describe("WriteModeSettings", () => {
	it("hides the publisher URL field in direct mode and switches mode", async () => {
		const onModeChange = vi.fn();
		const user = userEvent.setup();
		render(
			<WriteModeSettings
				mode="direct"
				onModeChange={onModeChange}
				publisherUrl=""
				onPublisherUrlChange={vi.fn()}
			/>,
		);
		expect(screen.queryByLabelText("Publisher URL")).toBeNull();
		await user.click(screen.getByLabelText("Custom publisher"));
		expect(onModeChange).toHaveBeenCalledWith("publisher");
	});

	it("shows and edits the publisher URL in publisher mode", async () => {
		const onPublisherUrlChange = vi.fn();
		const user = userEvent.setup();
		render(
			<WriteModeSettings
				mode="publisher"
				onModeChange={vi.fn()}
				publisherUrl=""
				onPublisherUrlChange={onPublisherUrlChange}
			/>,
		);
		await user.type(screen.getByLabelText("Publisher URL"), "h");
		expect(onPublisherUrlChange).toHaveBeenCalled();
	});
});
