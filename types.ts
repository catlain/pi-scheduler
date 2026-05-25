/**
 * scheduler 类型定义
 */

export interface Timer {
  id: string;
  prompt: string;
  intervalMs: number;
  createdAt: number;
  expiresAt: number;
  recurring: boolean;
  firedCount: number;
  status: "active" | "completed" | "cancelled" | "error";
}

export interface SchedulerState {
  timers: Timer[];
}
