import { describe, expect, it } from "vitest";
import { uploadPhaseLabel } from "./upload-phase-label.js";

describe("uploadPhaseLabel", () => {
	it("maps each phase to a human label", () => {
		expect(uploadPhaseLabel("encrypting")).toBe("Encrypting");
		expect(uploadPhaseLabel("uploading")).toBe("Uploading to Walrus");
		expect(uploadPhaseLabel("submitting")).toBe("Submitting transaction");
		expect(uploadPhaseLabel("complete")).toBe("Complete");
	});
});
