import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EpochCostEstimate } from "../types.js";
import { CostEstimate } from "./cost-estimate.js";

const estimate = {
	sizeBytes: 1,
	epochs: 5,
	encrypted: false,
	storage: {
		storageCostFrost: 0n,
		writeCostFrost: 0n,
		totalCostFrost: 1_500_000_000n,
	},
	walFrost: 1_500_000_000n,
	suiGasMist: 2_000_000_000n,
} as unknown as EpochCostEstimate;

describe("CostEstimate", () => {
	it("shows the loading and error labels", () => {
		const { rerender } = render(
			<CostEstimate estimate={null} status="loading" />,
		);
		expect(screen.getByText("Estimating...")).toBeTruthy();
		rerender(<CostEstimate estimate={null} status="error" />);
		expect(screen.getByText("Estimate unavailable")).toBeTruthy();
	});

	it("renders WAL and SUI amounts", () => {
		render(<CostEstimate estimate={estimate} status="success" />);
		expect(screen.getByText(/1\.5000 WAL/)).toBeTruthy();
		expect(screen.getByText(/2\.0000 SUI gas/)).toBeTruthy();
	});

	it("omits SUI when not provided", () => {
		const noGas = {
			...estimate,
			suiGasMist: null,
		} as unknown as EpochCostEstimate;
		render(<CostEstimate estimate={noGas} status="success" />);
		expect(screen.queryByText(/SUI gas/)).toBeNull();
	});
});
