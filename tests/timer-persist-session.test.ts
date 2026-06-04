import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getStateFilePath,
	persistTimersToFile,
	restoreTimersFromFile,
} from "../timer-persist";

// Mock fs
vi.mock("fs", () => ({
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
	existsSync: vi.fn(),
}));

const mockFs = vi.mocked(fs);

describe("timer-persist — per-session isolation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should_use_different_state_files_for_different_sessions", () => {
		const pathA = getStateFilePath("session-aaa");
		const pathB = getStateFilePath("session-bbb");
		expect(pathA).toContain("scheduler-state-session-aaa.json");
		expect(pathB).toContain("scheduler-state-session-bbb.json");
		expect(pathA).not.toBe(pathB);
	});

	it("should_only_restore_timers_from_current_session", () => {
		const timersA = [
			{
				id: "timer-1",
				intervalMs: 60000,
				prompt: "task A",
				recurring: true,
				status: "active",
				createdAt: Date.now(),
			},
		];
		const timersB = [
			{
				id: "timer-2",
				intervalMs: 120000,
				prompt: "task B",
				recurring: false,
				status: "active",
				createdAt: Date.now(),
				expiresAt: Date.now() + 120000,
			},
		];

		// Session A persists
		mockFs.writeFileSync.mockImplementation(() => {});
		persistTimersToFile(timersA, "session-aaa" as any);

		// Session B persists
		persistTimersToFile(timersB, "session-bbb" as any);

		// Each session only reads its own file
		mockFs.readFileSync.mockImplementation((p: string) => {
			if (p.includes("session-aaa")) return JSON.stringify(timersA);
			if (p.includes("session-bbb")) return JSON.stringify(timersB);
			throw new Error("ENOENT");
		});
		mockFs.existsSync.mockImplementation((p: string) => p.includes("session-"));

		const restoredA = restoreTimersFromFile("session-aaa");
		expect(restoredA).toHaveLength(1);
		expect(restoredA[0].id).toBe("timer-1");

		const restoredB = restoreTimersFromFile("session-bbb");
		expect(restoredB).toHaveLength(1);
		expect(restoredB[0].id).toBe("timer-2");
	});

	it("should_not_see_other_session_timers", () => {
		mockFs.existsSync.mockReturnValue(false);
		const restored = restoreTimersFromFile("session-new");
		expect(restored).toEqual([]);
	});
});
