/**
 * index.ts 测试 — 命令注册 + /loop + /remind + /tasks
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const { mockEngine, mockEngineFactory } = vi.hoisted(() => {
	const engine = {
		create: vi.fn(),
		cancel: vi.fn(),
		list: vi.fn(() => []),
		restore: vi.fn(),
		cleanup: vi.fn(),
	};
	return { mockEngine: engine, mockEngineFactory: vi.fn(() => engine) };
});
vi.mock("../timer-engine", () => ({ createTimerEngine: mockEngineFactory }));

const { mockParseLoopArgs } = vi.hoisted(() => ({ mockParseLoopArgs: vi.fn() }));
vi.mock("../parser", () => ({ parseLoopArgs: mockParseLoopArgs, parseInterval: vi.fn() }));

import schedulerExtension from "../index";

function createMockPi() {
	const commands = new Map<string, { handler: Function }>();
	const tools = new Map<string, { execute: Function }>();
	const events = new Map<string, Function>();
	const api = {
		registerCommand: vi.fn((name, def) => commands.set(name, def)),
		registerTool: vi.fn((def) => tools.set(def.name, def)),
		on: vi.fn((evt, handler) => events.set(evt, handler)),
		sendMessage: vi.fn(),
		appendEntry: vi.fn(),
	} as unknown as ExtensionAPI;
	return { api, commands, tools, events };
}

function createMockCtx(overrides?: Partial<ExtensionContext>): ExtensionContext {
	return {
		cwd: "/tmp/test",
		ui: {
			notify: vi.fn(),
			setStatus: vi.fn(),
			setWidget: vi.fn(),
			custom: vi.fn(async () => {}),
		},
		sessionManager: { getEntries: vi.fn(() => []) },
		...overrides,
	} as unknown as ExtensionContext;
}

// 供 tool+events 测试复用
export { createMockPi, createMockCtx, mockEngine, mockEngineFactory };

describe("scheduler commands", () => {
	let mockPi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockPi = createMockPi();
		mockEngine.create.mockReturnValue({
			id: "t1", prompt: "test", intervalMs: 300000, recurring: true, status: "active", firedCount: 0,
		});
		mockEngine.list.mockReturnValue([]);
		schedulerExtension(mockPi.api);
	});

	// --- 注册 ---

	it("should_register_3_commands_and_1_tool_and_events", () => {
		expect(mockPi.commands.has("loop")).toBe(true);
		expect(mockPi.commands.has("remind")).toBe(true);
		expect(mockPi.commands.has("tasks")).toBe(true);
		expect(mockPi.tools.has("schedule")).toBe(true);
		expect(mockPi.events.has("session_start")).toBe(true);
		expect(mockPi.events.has("session_shutdown")).toBe(true);
		expect(mockPi.events.has("before_agent_start")).toBe(true);
	});

	// --- /loop ---

	it("should_create_recurring_timer_via_loop", async () => {
		mockParseLoopArgs.mockReturnValue({ prompt: "check deploy", intervalMs: 300000 });
		const ctx = createMockCtx();
		await mockPi.commands.get("loop")!.handler("5m check deploy", ctx);
		expect(mockEngine.create).toHaveBeenCalledWith("check deploy", 300000, true);
		expect(ctx.ui.notify.mock.calls[0][0]).toContain("循环任务");
	});

	it("should_warn_when_no_loop_md_found", async () => {
		mockParseLoopArgs.mockReturnValue({ prompt: null, intervalMs: 300000 });
		const ctx = createMockCtx({ cwd: "/nonexistent/path" } as any);
		await mockPi.commands.get("loop")!.handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("loop.md"), "warning");
	});

	// --- /remind ---

	it("should_create_one_shot_via_remind", async () => {
		mockParseLoopArgs.mockReturnValue({ prompt: "check tests", intervalMs: 2700000 });
		const ctx = createMockCtx();
		await mockPi.commands.get("remind")!.handler("45m check tests", ctx);
		expect(mockEngine.create).toHaveBeenCalledWith("check tests", 2700000, false);
		expect(ctx.ui.notify.mock.calls[0][0]).toContain("提醒");
	});

	it("should_warn_on_empty_remind_args", async () => {
		mockParseLoopArgs.mockReturnValue({ prompt: null, intervalMs: 0 });
		const ctx = createMockCtx();
		await mockPi.commands.get("remind")!.handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("用法"), "warning");
	});

	// --- /tasks ---

	it("should_list_active_tasks", async () => {
		mockEngine.list.mockReturnValue([
			{ id: "t1", prompt: "check", intervalMs: 300000, recurring: true, status: "active", expiresAt: Date.now() + 200000, firedCount: 0 },
		]);
		const ctx = createMockCtx();
		await mockPi.commands.get("tasks")!.handler("", ctx);
		expect(ctx.ui.custom).toHaveBeenCalledWith(
			expect.any(Function),
			expect.objectContaining({ overlay: true }),
		);
	});

	it("should_cancel_task_by_id", async () => {
		mockEngine.cancel.mockReturnValue(true);
		const ctx = createMockCtx();
		await mockPi.commands.get("tasks")!.handler("cancel t1", ctx);
		expect(mockEngine.cancel).toHaveBeenCalledWith("t1");
		expect(ctx.ui.notify.mock.calls[0][0]).toContain("已取消");
	});

	it("should_warn_on_cancel_unknown_task", async () => {
		mockEngine.cancel.mockReturnValue(false);
		const ctx = createMockCtx();
		await mockPi.commands.get("tasks")!.handler("cancel xxx", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("未找到"), "warning");
	});

	it("should_show_empty_message_when_no_tasks", async () => {
		mockEngine.list.mockReturnValue([]);
		const ctx = createMockCtx();
		await mockPi.commands.get("tasks")!.handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("没有"), "info");
	});
});
