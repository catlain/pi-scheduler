/**
* timer-persist.test.ts — 跨会话持久化测试
*/
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTimerEngine } from "../timer-engine";
import type { Timer } from "../types";

// Mock fs for persistToFile / restoreFromFile
vi.mock("fs", () => ({
	existsSync: vi.fn(() => false),
	readFileSync: vi.fn(() => "[]"),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

import { writeFileSync, readFileSync, existsSync } from "fs";
import { persistTimersToFile, restoreTimersFromFile, getStateFilePath } from "../timer-persist";

const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);

describe("timer-persist", () => {
	beforeEach(() => {
	vi.clearAllMocks();
	});

	it("should persist active timers to file", () => {
	const timers: Timer[] = [
	  {
		id: "abc123",
		prompt: "check deploy",
		intervalMs: 300_000,
		createdAt: 1000,
		expiresAt: 301_000,
		recurring: true,
		firedCount: 0,
		status: "active",
	  },
	];
	persistTimersToFile(timers, "sess-abc");
	expect(mockWriteFileSync).toHaveBeenCalledWith(
	  getStateFilePath("sess-abc"),
	  expect.any(String),
	  "utf-8",
	);
	const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
	expect(written).toHaveLength(1);
	expect(written[0].id).toBe("abc123");
	});

	it("should not persist non-active timers", () => {
	const timers: Timer[] = [
	  { id: "a", prompt: "x", intervalMs: 1000, createdAt: 0, expiresAt: 1000, recurring: false, firedCount: 1, status: "completed" },
	  { id: "b", prompt: "x", intervalMs: 1000, createdAt: 0, expiresAt: 1000, recurring: false, firedCount: 0, status: "cancelled" },
	  { id: "c", prompt: "x", intervalMs: 1000, createdAt: 0, expiresAt: 2000, recurring: false, firedCount: 0, status: "active" },
	];
	persistTimersToFile(timers);
	const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
	expect(written).toHaveLength(1);
	expect(written[0].id).toBe("c");
	});

	it("should restore timers from file", () => {
	mockExistsSync.mockReturnValue(true);
	mockReadFileSync.mockReturnValue(JSON.stringify([
	  { id: "abc123", prompt: "check", intervalMs: 300_000, createdAt: 1000, expiresAt: Date.now() + 300_000, recurring: true, firedCount: 0, status: "active" },
	]));
	const restored = restoreTimersFromFile();
	expect(restored).toHaveLength(1);
	expect(restored[0].id).toBe("abc123");
	});

	it("should skip expired timers on restore", () => {
	mockExistsSync.mockReturnValue(true);
	mockReadFileSync.mockReturnValue(JSON.stringify([
	  { id: "expired", prompt: "old", intervalMs: 1000, createdAt: 1000, expiresAt: Date.now() - 1000, recurring: false, firedCount: 0, status: "active" },
	  { id: "valid", prompt: "new", intervalMs: 300_000, createdAt: 1000, expiresAt: Date.now() + 300_000, recurring: true, firedCount: 0, status: "active" },
	]));
	const restored = restoreTimersFromFile();
	expect(restored).toHaveLength(1);
	expect(restored[0].id).toBe("valid");
	});

	it("should return empty array when file does not exist", () => {
	mockExistsSync.mockReturnValue(false);
	const restored = restoreTimersFromFile();
	expect(restored).toEqual([]);
	});

	it("should return empty array on malformed JSON", () => {
	mockExistsSync.mockReturnValue(true);
	mockReadFileSync.mockReturnValue("not json");
	const restored = restoreTimersFromFile("sess-abc");
	expect(restored).toEqual([]);
	});

	it("should include recurring expired timers for re-schedule", () => {
	const now = Date.now();
	mockExistsSync.mockReturnValue(true);
	mockReadFileSync.mockReturnValue(JSON.stringify([
	  { id: "rec1", prompt: "loop check", intervalMs: 60_000, createdAt: now - 120_000, expiresAt: now - 60_000, recurring: true, firedCount: 5, status: "active" },
	]));
	const restored = restoreTimersFromFile("sess-abc");
	expect(restored).toHaveLength(1);
	// 应该重新计算 expiresAt = now + intervalMs
	expect(restored[0].expiresAt).toBeGreaterThan(now);
	});
});
