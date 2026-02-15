import { createContext } from "./runtime";
import { formatGateUsage, requireChecker } from "./registry";

export const GATE_USAGE = formatGateUsage();

export async function runGate(rootDir: string, id: string): Promise<void> {
	const checker = requireChecker(id);
	const ctx = createContext(rootDir);
	await checker.run(ctx);
}
