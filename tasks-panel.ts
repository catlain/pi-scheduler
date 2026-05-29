/**
 * tasks-panel — /tasks 交互式面板组件
 *
 * 参考 /context 面板模式，用 ctx.ui.custom() 实现 overlay 面板：
 * - ↑↓ 选择任务
 * - d 标记取消（y/n 确认）
 * - Esc 退出
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Timer } from "./types";
import type { TimerEngine } from "./timer-engine";

export async function openTasksPanel(
	ctx: ExtensionContext,
	active: Timer[],
	engine: TimerEngine,
): Promise<void> {
	await ctx.ui.custom(
		(tui, theme, kb, done) => {
			let selected = 0;
			let confirming = false;
			const cancelled = new Set<string>();

			const renderTasks = (): string[] => {
				const now = Date.now();
				const lines: string[] = [];
				lines.push(theme.bold("  ⏱ 定时任务管理"));
				lines.push("");
				for (let i = 0; i < active.length; i++) {
					const t = active[i];
					const remaining = Math.max(
						0,
						Math.round((t.expiresAt - now) / 60_000),
					);
					const tag = t.recurring ? "↻" : "⏰";
					const isCancelled = cancelled.has(t.id);
					const isSelected = i === selected;
					const cursor = isSelected ? "> " : "  ";
					const status = isCancelled ? " [已取消]" : "";
					const prompt =
						t.prompt.length > 45
							? t.prompt.slice(0, 42) + "..."
							: t.prompt;
					lines.push(
						`${cursor}${tag} ${prompt}  (${remaining}m)${status}`,
					);
				}
				lines.push("");
				if (confirming) {
					lines.push(theme.bold("  确认取消当前任务? y/n"));
				} else {
					lines.push("  ↑↓ 选择  d 取消  Esc 退出");
				}
				return lines;
			};

			return {
				render: (_w: number) => renderTasks(),
				invalidate: () => {},
				handleInput: (kd: unknown) => {
					if (confirming) {
						if (kd === "y" || kd === "Y") {
							const t = active[selected];
							if (t) {
								engine.cancel(t.id);
								cancelled.add(t.id);
							}
							confirming = false;
							tui.requestRender();
							return;
						}
						if (kd === "n" || kd === "N") {
							confirming = false;
							tui.requestRender();
							return;
						}
						return;
					}

					if (kb.matches(kd, "tui.select.up")) {
						selected = Math.max(0, selected - 1);
						tui.requestRender();
					} else if (kb.matches(kd, "tui.select.down")) {
						selected = Math.min(active.length - 1, selected + 1);
						tui.requestRender();
					} else if (kd === "d" || kd === "D") {
						confirming = true;
						tui.requestRender();
					} else if (kb.matches(kd, "tui.select.cancel")) {
						done(undefined);
					}
				},
			};
		},
		{ overlay: true },
	);
}
