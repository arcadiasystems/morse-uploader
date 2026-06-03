import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals is false, so Testing Library's automatic cleanup is not registered;
// unmount rendered trees after each test to avoid cross-test DOM leakage.
afterEach(() => {
	cleanup();
});
