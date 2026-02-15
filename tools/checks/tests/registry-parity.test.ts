import { describe, expect, it } from "bun:test";
import { CHECK_ORDER_ALL } from "../checkers";
import {
	formatCheckUsage,
	formatGateUsage,
	listAllOrder,
	listCheckerIds,
	listCheckers,
	resolveExecutionOrder,
} from "../core/registry";

describe("checker registry parity", () => {
	it("keeps the legacy checker id set", () => {
		const ids = listCheckers()
			.map((checker) => checker.id)
			.sort();
		expect(ids).toEqual([
			"archlint",
			"doclint",
			"fmt",
			"fmtcheck",
			"lint",
			"taskflow",
			"test",
			"type",
			"ui",
			"workflow",
		]);
	});

	it("keeps legacy make check ordering", () => {
		expect(CHECK_ORDER_ALL).toEqual([
			"workflow",
			"fmtcheck",
			"lint",
			"type",
			"test",
			"ui",
			"doclint",
			"archlint",
			"taskflow",
		]);
	});

	it("keeps retry commands aligned with legacy make targets", () => {
		const retryMap = Object.fromEntries(
			listCheckers().map((checker) => [checker.id, checker.retryCommand]),
		);
		expect(retryMap).toEqual({
			fmt: "make fmt",
			fmtcheck: "make fmtcheck",
			lint: "make lint",
			type: "make type",
			test: "make test",
			ui: "make ui",
			doclint: "make doclint",
			archlint: "make archlint",
			workflow: "make workflow",
			taskflow: "make taskflow",
		});
	});

	it("derives check and gate usage from the registry target ids", () => {
		const ids = listCheckerIds();
		expect(formatCheckUsage()).toBe(
			`Usage: bun run ./tools/checks/cli.ts check [${ids.join("|")}|all]`,
		);
		expect(formatGateUsage()).toBe(
			`Usage: bun run ./tools/checks/cli.ts gate [${ids.join("|")}]`,
		);
	});

	it("resolves all-target execution order from the canonical all-order list", () => {
		expect(resolveExecutionOrder("all")).toEqual(listAllOrder());
		expect(resolveExecutionOrder("fmt")).toEqual(["fmt"]);
	});

	it("rejects unknown check targets consistently", () => {
		expect(() => resolveExecutionOrder("unknown-gate")).toThrow(
			"Unknown check target: unknown-gate",
		);
	});
});
