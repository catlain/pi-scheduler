/**
 * timer-engine.ts 测试 — 定时器核心逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTimerEngine } from "../timer-engine";
import type { Timer } from "../types";

function createMockPi() {
  return {
    sendUserMessage: vi.fn(),
    appendEntry: vi.fn(),
  };
}

describe("createTimerEngine", () => {
  let pi: ReturnType<typeof createMockPi>;
  let onUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    pi = createMockPi();
    onUpdate = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- create ---

  it("should_create_timer_and_return_it", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const timer = engine.create("check deploy", 300_000, true);

    expect(timer.prompt).toBe("check deploy");
    expect(timer.intervalMs).toBe(300_000);
    expect(timer.recurring).toBe(true);
    expect(timer.status).toBe("active");
    expect(timer.firedCount).toBe(0);
    expect(pi.appendEntry).toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalled();
  });

  // --- fire (recurring) ---

  it("should_fire_recurring_timer_and_reschedule", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const timer = engine.create("check deploy", 300_000, true);

    // 第一次触发
    vi.advanceTimersByTime(300_000 + 30_000); // 5m + max jitter

    const timers = engine.list();
    expect(pi.sendUserMessage).toHaveBeenCalledWith(`[定时任务 ${timers[0].id}] check deploy`);
    expect(timer.firedCount).toBe(1);
    expect(timer.status).toBe("active"); // 仍然活跃
  });

  // --- fire (one-shot) ---

  it("should_fire_one_shot_timer_and_complete", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const timer = engine.create("remind me", 60_000, false);

    vi.advanceTimersByTime(60_000 + 5_000);

    const timers = engine.list();
    expect(pi.sendUserMessage).toHaveBeenCalledWith(`[定时任务 ${timers[0].id}] remind me`);
    expect(timer.firedCount).toBe(1);
    expect(timer.status).toBe("completed");
  });

  // --- cancel ---

  it("should_cancel_timer_and_clear_timeout", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const timer = engine.create("check", 300_000, true);

    engine.cancel(timer.id);

    expect(timer.status).toBe("cancelled");

    // 不应再触发
    vi.advanceTimersByTime(600_000);
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("should_return_false_when_cancelling_unknown_id", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    expect(engine.cancel("nonexistent")).toBe(false);
  });

  // --- list ---

  it("should_list_all_timers", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    engine.create("task a", 300_000, true);
    engine.create("task b", 600_000, false);

    const list = engine.list();
    expect(list).toHaveLength(2);
  });

  // --- restore ---

  it("should_restore_unexpired_timers", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const now = Date.now();
    const entries = [
      {
        type: "custom",
        customType: "scheduler",
        data: {
          timers: [
            {
              id: "abc12345",
              prompt: "check",
              intervalMs: 300_000,
              createdAt: now - 100_000,
              expiresAt: now + 200_000, // 还没到期
              recurring: true,
              firedCount: 0,
              status: "active",
            },
          ],
        },
      },
    ];

    engine.restore(entries as any);

    const list = engine.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("abc12345");

    // 应该在剩余时间后触发
    vi.advanceTimersByTime(200_000 + 30_000);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(`[定时任务 abc12345] check`);
  });

  it("should_skip_expired_timers_on_restore", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const now = Date.now();
    const entries = [
      {
        type: "custom",
        customType: "scheduler",
        data: {
          timers: [
            {
              id: "expired1",
              prompt: "old task",
              intervalMs: 60_000,
              createdAt: now - 120_000,
              expiresAt: now - 60_000, // 已过期
              recurring: false,
              firedCount: 0,
              status: "active",
            },
          ],
        },
      },
    ];

    engine.restore(entries as any);

    expect(engine.list()).toHaveLength(0);
  });

  // --- cleanup ---

  it("should_cleanup_all_timers", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    engine.create("a", 300_000, true);
    engine.create("b", 600_000, false);

    engine.cleanup();

    // 不应触发
    vi.advanceTimersByTime(3_600_000);
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  // --- error handling ---

  it("should_not_crash_when_sendUserMessage_throws", () => {
    pi.sendUserMessage.mockImplementation(() => {
      throw new Error("session replaced");
    });

    const engine = createTimerEngine(pi as any, onUpdate);
    const timer = engine.create("check", 60_000, false);

    // 不应崩溃
    vi.advanceTimersByTime(60_000 + 5_000);

    expect(timer.status).toBe("completed"); // 仍然标记完成
  });
});
