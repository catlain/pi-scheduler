/**
 * timer-engine.ts 恢复与边界情况测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTimerEngine } from "../timer-engine";

function createMockPi() {
  return {
    sendMessage: vi.fn(),
    appendEntry: vi.fn(),
  };
}

describe("createTimerEngine — restore & edge cases", () => {
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
    expect(pi.sendMessage).toHaveBeenCalledWith(
      { customType: "scheduler", display: true, content: "[定时任务 abc12345] check" },
      { triggerTurn: true },
    );
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

  it("should_skip_non_scheduler_entries_on_restore", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const entries = [
      { type: "user_message", customType: undefined, data: undefined },
      { type: "custom", customType: "other", data: { timers: [] } },
      { type: "custom", customType: "scheduler", data: {} }, // no timers
    ];

    engine.restore(entries as any);
    expect(engine.list()).toHaveLength(0);
  });

  it("should_skip_scheduler_entry_without_timers_data", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const entries = [
      {
        type: "custom",
        customType: "scheduler",
        data: {}, // no .timers
      },
    ];

    engine.restore(entries as any);
    expect(engine.list()).toHaveLength(0);
  });

  it("should_skip_non_active_timer_on_restore", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const now = Date.now();
    const entries = [
      {
        type: "custom",
        customType: "scheduler",
        data: {
          timers: [
            {
              id: "cancelled1",
              prompt: "cancelled task",
              intervalMs: 60_000,
              createdAt: now - 120_000,
              expiresAt: now + 60_000,
              recurring: false,
              firedCount: 0,
              status: "cancelled", // not "active"
            },
          ],
        },
      },
    ];

    engine.restore(entries as any);
    expect(engine.list()).toHaveLength(0);
  });

  // --- fire with non-active status ---

  it("should_early_return_when_firing_non_active_timer", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const timer = engine.create("check", 300_000, true);

    // 手动设为非活跃（模拟取消但未清 timeout）
    timer.status = "cancelled";

    vi.advanceTimersByTime(300_000 + 30_000);

    expect(pi.sendMessage).not.toHaveBeenCalled();
    expect(timer.firedCount).toBe(0);
  });

  // --- cancel without handle ---

  it("should_cancel_completed_timer_without_handle", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    const timer = engine.create("one-shot", 60_000, false);

    vi.advanceTimersByTime(60_000 + 5_000);
    expect(timer.status).toBe("completed");
    expect(pi.sendMessage).toHaveBeenCalledOnce();

    const result = engine.cancel(timer.id);
    expect(result).toBe(true);
    expect(timer.status).toBe("cancelled");
  });

  // --- cleanup ---

  it("should_cleanup_all_timers", () => {
    const engine = createTimerEngine(pi as any, onUpdate);
    engine.create("a", 300_000, true);
    engine.create("b", 600_000, false);

    engine.cleanup();

    vi.advanceTimersByTime(3_600_000);
    expect(pi.sendMessage).not.toHaveBeenCalled();
  });

  // --- error handling ---

  it("should_not_crash_when_sendMessage_throws", () => {
    pi.sendMessage.mockImplementation(() => {
      throw new Error("session replaced");
    });

    const engine = createTimerEngine(pi as any, onUpdate);
    const timer = engine.create("check", 60_000, false);

    vi.advanceTimersByTime(60_000 + 5_000);

    expect(timer.status).toBe("completed"); // 仍然标记完成
  });
});
