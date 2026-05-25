/**
 * 定时器引擎 — 创建/取消/触发/恢复定时器
 */

import type { Timer } from "./types";

const JITTER_MAX_MS = 30_000;

export interface TimerEngine {
  create(prompt: string, intervalMs: number, recurring: boolean): Timer;
  cancel(id: string): boolean;
  list(): Timer[];
  restore(entries: any[]): void;
  cleanup(): void;
}

export function createTimerEngine(
  pi: { sendUserMessage: (msg: string) => void; appendEntry: (type: string, data: any) => void },
  onUpdate: () => void,
): TimerEngine {
  const timers = new Map<string, Timer>();
  const handles = new Map<string, ReturnType<typeof setTimeout>>();

  function persist(): void {
    pi.appendEntry("scheduler", { timers: Array.from(timers.values()) });
  }

  function schedule(timer: Timer): void {
    const delay = Math.max(0, timer.expiresAt - Date.now());
    const handle = setTimeout(() => fire(timer.id), delay);
    handles.set(timer.id, handle);
  }

  function fire(id: string): void {
    const timer = timers.get(id);
    if (!timer || timer.status !== "active") return;

    try {
      pi.sendUserMessage(`[定时任务 ${id}] ${timer.prompt}`);
    } catch {
      timer.status = "error";
    }

    timer.firedCount++;

    if (timer.recurring) {
      // 重算下次到期 + jitter
      const jitter = Math.random() * Math.min(timer.intervalMs * 0.1, JITTER_MAX_MS);
      timer.expiresAt = Date.now() + timer.intervalMs + Math.round(jitter);
      timer.status = "active";
      schedule(timer);
    } else {
      timer.status = "completed";
      handles.delete(id);
    }

    persist();
    onUpdate();
  }

  return {
    create(prompt, intervalMs, recurring): Timer {
      const id = Math.random().toString(36).slice(2, 10);
      const now = Date.now();
      const timer: Timer = {
        id,
        prompt,
        intervalMs,
        createdAt: now,
        expiresAt: now + intervalMs,
        recurring,
        firedCount: 0,
        status: "active",
      };
      timers.set(id, timer);
      schedule(timer);
      persist();
      onUpdate();
      return timer;
    },

    cancel(id): boolean {
      const timer = timers.get(id);
      if (!timer) return false;
      timer.status = "cancelled";
      const handle = handles.get(id);
      if (handle !== undefined) {
        clearTimeout(handle);
        handles.delete(id);
      }
      persist();
      onUpdate();
      return true;
    },

    list(): Timer[] {
      return Array.from(timers.values());
    },

    restore(entries): void {
      for (const entry of entries) {
        if (entry.type === "custom" && entry.customType === "scheduler" && entry.data?.timers) {
          const now = Date.now();
          for (const t of entry.data.timers as Timer[]) {
            if (t.status !== "active") continue;
            if (t.expiresAt <= now) continue;
            timers.set(t.id, t);
            schedule(t);
          }
        }
      }
      onUpdate();
    },

    cleanup(): void {
      for (const handle of handles.values()) {
        clearTimeout(handle);
      }
      handles.clear();
    },
  };
}
