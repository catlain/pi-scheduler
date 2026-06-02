/**
 * timer-persist — 跨会话持久化
 *
 * 将 active timer 写入文件，新会话启动时恢复。
 * 路径：~/.pi/agent/scheduler-state.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Timer } from "./types";

export const SCHEDULER_STATE_DIR = join(homedir(), ".pi", "agent");

/** 获取指定 session 的持久化文件路径 */
export function getStateFilePath(sessionId: string): string {
	return join(SCHEDULER_STATE_DIR, `scheduler-state-${sessionId}.json`);
}

/**
 * 持久化 active timer 到文件
 */
export function persistTimersToFile(timers: Timer[], sessionId: string): void {
	const active = timers.filter((t) => t.status === "active");
	try {
		mkdirSync(SCHEDULER_STATE_DIR, { recursive: true });
		writeFileSync(getStateFilePath(sessionId), JSON.stringify(active, null, 2), "utf-8");
	} catch {
		// 静默失败 — 持久化失败不应影响主流程
	}
}

/**
 * 从文件恢复 timer
 *
 * - 跳过已过期的非循环 timer
 * - 循环 timer 如果已过期，重新计算 expiresAt
 */
export function restoreTimersFromFile(sessionId: string): Timer[] {
	const filePath = getStateFilePath(sessionId);
	if (!existsSync(filePath)) {
		return [];
	}

	try {
		const raw = readFileSync(filePath, "utf-8");
		const timers: Timer[] = JSON.parse(raw);
		const now = Date.now();

		return timers
			.filter((t) => t.status === "active")
			.map((t) => {
				// 循环任务已过期 → 重新调度
				if (t.recurring && t.expiresAt <= now) {
					return { ...t, expiresAt: now + t.intervalMs };
				}
				return t;
			})
			.filter((t) => t.expiresAt > now || t.recurring);
	} catch {
		return [];
	}
}
