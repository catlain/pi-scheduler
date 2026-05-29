/**
 * scheduler — 会话内定时任务扩展
 *
 * 命令：/loop、/remind、/tasks
 * 工具：schedule（create/list/cancel）
 */

import type {
	AgentToolResult,
	BeforeAgentStartEvent,
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { parseLoopArgs } from "./parser";
import { createTimerEngine } from "./timer-engine";
import { openTasksPanel } from "./tasks-panel";
import { createUpdateUI, readLoopMd } from "./ui-helpers";

export default function schedulerExtension(pi: ExtensionAPI): void {
	let cachedUi: ExtensionContext["ui"] | null = null;

	let engine = createTimerEngine(
		{
			sendMessage: (msg, opts) => pi.sendMessage(msg, opts),
			appendEntry: (type, data) => pi.appendEntry(type, data),
		},
		() => {},
	);

	const updateUI = createUpdateUI(() => cachedUi, () => engine);

	// --- 命令 ---

	pi.registerCommand("loop", {
		description: "创建重复定时任务。用法: /loop [interval] <prompt>，如 /loop 5m check deploy",
		handler: async (args: string, ctx: ExtensionContext) => {
			const parsed = parseLoopArgs(args);
			let prompt = parsed.prompt;
			let intervalMs = parsed.intervalMs;

			if (!prompt) {
				const content = readLoopMd(ctx.cwd);
				if (!content) {
					ctx.ui.notify("未找到 loop.md（.pi/loop.md 或 ~/.pi/agent/loop.md）。请输入 prompt 或创建 loop.md。", "warning");
					return;
				}
				prompt = content;
			}

			const timer = engine.create(prompt, intervalMs, true);
			ctx.ui.notify(`⏱ 循环任务已创建: "${prompt.slice(0, 50)}" 每 ${Math.round(intervalMs / 60_000)}m  id=${timer.id}`, "info");
		},
	});

	pi.registerCommand("remind", {
		description: "创建一次性提醒。用法: /remind <interval> <message>，如 /remind 45m check tests",
		handler: async (args: string, ctx: ExtensionContext) => {
			const parsed = parseLoopArgs(args);
			if (!parsed.prompt) {
				ctx.ui.notify("用法: /remind <interval> <message>，如 /remind 45m check tests", "warning");
				return;
			}

			const timer = engine.create(parsed.prompt, parsed.intervalMs, false);
			ctx.ui.notify(`⏰ 提醒已创建: "${parsed.prompt.slice(0, 50)}"  ${Math.round(parsed.intervalMs / 60_000)}m 后  id=${timer.id}`, "info");
		},
	});

	pi.registerCommand("tasks", {
		description: "管理定时任务。/tasks 打开交互面板，/tasks cancel <id> 直接取消",
		handler: async (args: string, ctx: ExtensionContext) => {
			const parts = args.trim().split(/\s+/);
			if (parts[0] === "cancel" && parts[1]) {
				const ok = engine.cancel(parts[1]);
				ctx.ui.notify(ok ? `已取消任务 ${parts[1]}` : `未找到任务 ${parts[1]}`, ok ? "info" : "warning");
				return;
			}

			const active = engine.list().filter((t) => t.status === "active");
			if (active.length === 0) {
				ctx.ui.notify("没有活跃的定时任务\n\n用法:\n  /tasks              # 打开任务面板\n  /tasks cancel <id>  # 直接取消", "info");
				return;
			}

			await openTasksPanel(ctx, active, engine);
		},
	});

	// --- 工具 ---

	pi.registerTool({
		name: "schedule",
		label: "Schedule",
		description: "定时任务管理。创建定时/重复消息、列出任务、取消任务。用户说'提醒我'、'定时'、'每X分钟'、'loop'时使用此工具。",
		promptSnippet: "定时任务: 创建/列出/取消定时或重复消息",
		parameters: {
			type: "object",
			properties: {
				action: { type: "string", enum: ["create", "list", "cancel"], description: "操作类型" },
				interval_ms: { type: "number", description: "间隔毫秒（create 时必填）" },
				prompt: { type: "string", description: "注入的消息（create 时必填）" },
				recurring: { type: "boolean", description: "是否重复（默认 false）" },
				id: { type: "string", description: "任务 ID（cancel 时必填）" },
			},
			required: ["action"],
		},
		async execute(_toolCallId: string, params: Record<string, unknown>): Promise<AgentToolResult> {
			const action = params.action as string;

			if (action === "create") {
				const p = params.prompt as string;
				const ms = params.interval_ms as number;
				if (!p || !ms) {
					return { content: [{ type: "text", text: "缺少 prompt 或 interval_ms 参数" }] };
				}
				const timer = engine.create(p, ms, !!params.recurring);
				return {
					content: [{
						type: "text",
						text: `定时任务已创建: id=${timer.id} prompt="${p.slice(0, 50)}" interval=${Math.round(ms / 60_000)}m recurring=${timer.recurring}`,
					}],
				};
			}

			if (action === "list") {
				const active = engine.list().filter((t) => t.status === "active");
				if (active.length === 0) {
					return { content: [{ type: "text", text: "没有活跃的定时任务" }] };
				}
				const lines = active.map((t) => {
					const remaining = Math.max(0, Math.round((t.expiresAt - Date.now()) / 60_000));
					return `${t.recurring ? "↻" : "⏰"} ${t.prompt.slice(0, 50)} (${remaining}m) id=${t.id}`;
				});
				return { content: [{ type: "text", text: lines.join("\n") }] };
			}

			if (action === "cancel") {
				const id = params.id as string;
				if (!id) {
					return { content: [{ type: "text", text: "缺少 id 参数" }] };
				}
				const ok = engine.cancel(id);
				return {
					content: [{ type: "text", text: ok ? `已取消任务 ${id}` : `未找到任务 ${id}` }],
				};
			}

			return { content: [{ type: "text", text: `未知 action: ${action}` }] };
		},
	});

	// --- 事件 ---

	pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
		cachedUi = ctx.ui;
		// 清理旧 engine 的所有 setTimeout，防止泄漏
		engine.cleanup();
		const entries = ctx.sessionManager.getEntries();
		const newUpdateUI = createUpdateUI(() => cachedUi, () => engine);
		engine = createTimerEngine(
			{
				sendMessage: (msg, opts) => pi.sendMessage(msg, opts),
				appendEntry: (type, data) => pi.appendEntry(type, data),
			},
			newUpdateUI,
		);
		engine.restore(entries);
	});

	pi.on("session_shutdown", async () => {
		engine.cleanup();
	});

	// /reload 防御：如果 session_start 未触发，通过 before_agent_start 懒恢复
	let restored = false;
	pi.on("before_agent_start", async (_event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
		cachedUi = ctx.ui;
		if (restored) return;
		restored = true;
		const entries = ctx.sessionManager.getEntries();
		const hasTimers = entries.some((e: SessionEntry) =>
			e.type === "custom" && (e as { customType?: string }).customType === "scheduler",
		);
		if (hasTimers) {
			engine.restore(entries);
			ctx.ui.notify(
				`⏱ 已恢复 ${engine.list().filter((t) => t.status === "active").length} 个定时任务`,
				"info",
			);
		}
	});
}
