/**
 * ui-helpers — UI 更新和 loop.md 读取
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TimerEngine } from "./timer-engine";

export function createUpdateUI(
	getUi: () => ExtensionContext["ui"] | null,
	getEngine: () => TimerEngine,
): () => void {
	return () => {
		const ui = getUi();
		if (!ui) return;
		const engine = getEngine();
		const active = engine.list().filter((t) => t.status === "active");
		if (active.length === 0) {
			ui.setStatus("scheduler", undefined);
			return;
		}
		ui.setStatus("scheduler", `⏱ ${active.length}`);
	};
}

export function readLoopMd(cwd: string): string | null {
	const locations = [
		path.join(cwd, ".pi", "loop.md"),
		path.join(os.homedir(), ".pi", "agent", "loop.md"),
	];
	for (const p of locations) {
		if (fs.existsSync(p)) {
			return fs.readFileSync(p, "utf-8").trim();
		}
	}
	return null;
}
