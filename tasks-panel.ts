/**
 * tasks-panel — /tasks 交互式面板组件
 *
 * 样式参考 /context 面板：
 * - DynamicBorder 边框 + 主题色
 * - 底部 overlay，靠近输入框
 * - ↑↓ 选择 · d 取消(y/n 确认) · Esc 退出
 */

import {
	DynamicBorder,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { Timer } from "./types";
import type { TimerEngine } from "./timer-engine";

const bdr = (c: Container, t: Theme) =>
	c.addChild(new DynamicBorder((s: string) => t.fg("accent", s)));
const ln = (c: Container, t: Theme, s: string) => c.addChild(new Text(s, 1, 0));
const sp = (c: Container) => c.addChild(new Spacer(1));

function formatInterval(ms: number): string {
	if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
	if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
	return `${Math.round(ms / 1_000)}s`;
}

function formatRemaining(expiresAt: number): string {
	const mins = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
	if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60}m`;
	return `${mins}m`;
}

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

			const render = () => {
				const container = new Container();
				bdr(container, theme);
				ln(container, theme, theme.fg("accent", theme.bold(" ⏱ 定时任务")));
				sp(container);

				if (active.length === 0) {
					ln(
						container,
						theme,
						theme.fg("dim", "  没有活跃的定时任务"),
					);
				} else {
					for (let i = 0; i < active.length; i++) {
						const t = active[i];
						const isCancelled = cancelled.has(t.id);
						const isSelected = i === selected;
						const ptr = isSelected
							? theme.fg("accent", "→ ")
							: "  ";
						const tag = t.recurring
							? theme.fg("accent", "↻")
							: theme.fg("text", "⏰");
						const prompt =
							t.prompt.length > 35
								? t.prompt.slice(0, 32) + "..."
								: t.prompt;
						const interval = formatInterval(t.intervalMs);
						const remaining = formatRemaining(t.expiresAt);
						const status = isCancelled
							? theme.fg("dim", " 已取消")
							: theme.fg("dim", ` ${remaining}后触发`);
						ln(
							container,
							theme,
							`${ptr}${tag} ${theme.fg("text", prompt.padEnd(35))} ${theme.fg("dim", interval.padStart(4))}${status}`,
						);
					}
				}

				sp(container);
				if (confirming) {
					ln(
						container,
						theme,
						theme.fg("accent", theme.bold("  确认取消?")) +
							" " +
							theme.fg("dim", "y 确认 · n 取消"),
					);
				} else {
					ln(
						container,
						theme,
						theme.fg("dim", " ↑↓ 选择 · d 取消 · Esc 退出"),
					);
				}
				bdr(container, theme);
				tui.requestRender();
				return container;
			};

			let currentContainer = render();

			return {
				render: (w: number) => {
					currentContainer = render();
					return currentContainer.render(w);
				},
				invalidate: () => currentContainer.invalidate(),
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
						if (kd === "n" || kd === "N" || kb.matches(kd, "tui.select.cancel")) {
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
						if (active.length > 0) {
							confirming = true;
							tui.requestRender();
						}
					} else if (kb.matches(kd, "tui.select.cancel")) {
						done(undefined);
					}
				},
			};
		},
		{
			overlay: true,
			overlayOptions: {
				position: "bottom" as any,
				maxHeight: 20,
			},
		},
	);
}
