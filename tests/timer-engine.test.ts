/**
 * timer-engine.ts 测试 — 定时器核心逻辑（创建/触发/取消/列表）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTimerEngine } from "../timer-engine";

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
    expect(pi.sendUserMessage).toHaveBeenCalledWith(
      `[定时任务 ${timers[0].id}] check deploy`,
      { deliverAs: "followUp" },
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
    expect(pi.sendUserMessage).toHaveBeenCalledWith(
      `[定时任务 ${timers[0].id}] remind me`,
      { deliverAs: "followUp" },
    );
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
});
