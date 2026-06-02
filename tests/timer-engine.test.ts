/**
 * timer-engine.ts — 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTimerEngine } from "../timer-engine.js";

describe("createTimerEngine", () => {
	const onUpdate = vi.fn();
	const pi = {
		sendMessage: vi.fn(),
		appendEntry: vi.fn(),
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// --- fire (recurring) ---

	it("should_fire_recurring_timer", () => {
		const engine = createTimerEngine(pi as any, onUpdate);
		const timer = engine.create("check deploy", 300_000, true);

		// 第一次触发
		vi.advanceTimersByTime(300_000 + 30_000); // 5m + max jitter

		const timers = engine.list();
		expect(pi.sendMessage).toHaveBeenCalledWith(
			{ customType: "scheduler", display: false, content: `[定时任务 ${timers[0].id}] check deploy` },
			{ triggerTurn: true },
		);
		expect(timer.firedCount).toBe(1);
		expect(timer.status).toBe("active"); // 仍然活跃
	});

	// --- fire (one-shot) ---

	it("should_fire_one_shot_timer_and_complete", () => {
		const engine = createTimerEngine(pi as any, onUpdate);
		const timer = engine.create("remind me", 60_000, false);

		vi.advanceTimersByTime(60_000 + 5_000);

		const timers = engine.list();
		expect(pi.sendMessage).toHaveBeenCalledWith(
			{ customType: "scheduler", display: false, content: `[定时任务 ${timers[0].id}] remind me` },
			{ triggerTurn: true },
		);
		expect(timer.firedCount).toBe(1);
		expect(timer.status).toBe("completed");
	});

	// --- cancel ---

	it("should_cancel_timer", () => {
		const engine = createTimerEngine(pi as any, onUpdate);
		const timer = engine.create("to cancel", 60_000, false);

		engine.cancel(timer.id);

		vi.advanceTimersByTime(120_000);
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("should_not_throw_on_cancel_unknown_id", () => {
		const engine = createTimerEngine(pi as any, onUpdate);
		expect(() => engine.cancel("nonexistent")).not.toThrow();
	});

	// --- list ---

	it("should_list_all_timers", () => {
		const engine = createTimerEngine(pi as any, onUpdate);
		engine.create("a", 60_000, false);
		engine.create("b", 120_000, true);

		const list = engine.list();
		expect(list).toHaveLength(2);
		expect(list[0].prompt).toBe("a");
		expect(list[1].prompt).toBe("b");
	});
});
