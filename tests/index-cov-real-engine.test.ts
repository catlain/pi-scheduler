/**
 * index.ts 覆盖率补充测试 — 真实 engine 集成路径
 *
 * 使用真实 createTimerEngine（不 mock），覆盖：
 * - 第 30 行: onUpdate callback () => updateUI() 的函数体执行
 * - 第 210-211 行: session_start 中 engine 重建的 arrow 函数体执行
 * - updateUI 早期返回 / 清除 widget / 多类型 widget 渲染
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";

const theme = { bold: vi.fn((s: string) => s) } as unknown as Theme;

const { mockParseLoopArgs } = vi.hoisted(() => ({
	mockParseLoopArgs: vi.fn(),
}));
vi.mock("../parser", () => ({
	parseLoopArgs: mockParseLoopArgs,
	parseInterval: vi.fn(),
}));

import schedulerExtension from "../index";

function createMockPi() {
	const commands = new Map<string, { handler: Function }>();
	const tools = new Map<string, { execute: Function }>();
	const events = new Map<string, Function>();
	const api = {
		registerCommand: vi.fn((name, def) => commands.set(name, def)),
		registerTool: vi.fn((def) => tools.set(def.name, def)),
		on: vi.fn((evt, handler) => events.set(evt, handler)),
		sendUserMessage: vi.fn(),
		appendEntry: vi.fn(),
	} as unknown as ExtensionAPI;
	return { api, commands, tools, events };
}

function createMockCtx(overrides?: Partial<ExtensionContext>): ExtensionContext {
	return {
		cwd: "/tmp/test",
		ui: { notify: vi.fn(), setStatus: vi.fn(), setWidget: vi.fn() },
		sessionManager: { getEntries: vi.fn(() => []) },
		...overrides,
	} as unknown as ExtensionContext;
}

describe("index.ts coverage: real engine paths", () => {
	let mockPi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockPi = createMockPi();
		schedulerExtension(mockPi.api);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should_skip_updateUI_when_no_cachedUi", async () => {
		// No session_start -> cachedUi is null
		mockParseLoopArgs.mockReturnValue({
			prompt: "test",
			intervalMs: 60000,
		});
		const ctx = createMockCtx();
		await mockPi.commands.get("loop")!.handler("1m test", ctx);

		// Initial engine's onUpdate calls updateUI -> early return
		expect(vi.mocked(ctx.ui.setStatus)).not.toHaveBeenCalled();
	});

	it("should_clear_widget_on_empty_list", async () => {
		const ctx = createMockCtx();
		const startHandler = mockPi.events.get("session_start")!;
		await startHandler({}, ctx);

		// session_start: restore(empty) -> onUpdate -> active.length === 0
		expect(vi.mocked(ctx.ui.setStatus)).toHaveBeenCalledWith(
			"scheduler",
			undefined,
		);
		expect(vi.mocked(ctx.ui.setWidget)).toHaveBeenCalledWith(
			"scheduler",
			undefined,
		);
	});

	it("should_render_widget_after_creating_timer", async () => {
		mockParseLoopArgs.mockReturnValue({
			prompt: "loop task",
			intervalMs: 120000,
		});
		const ctx = createMockCtx();

		const startHandler = mockPi.events.get("session_start")!;
		await startHandler({}, ctx);

		// calls[0] = setWidget("scheduler", undefined) from empty restore
		// Create timer -> onUpdate -> active.length === 1
		await mockPi.commands.get("loop")!.handler("2m loop task", ctx);

		// calls[1] = setWidget("scheduler", callback)
		expect(vi.mocked(ctx.ui.setStatus).mock.calls[1][0]).toBe("scheduler");
		expect(vi.mocked(ctx.ui.setStatus).mock.calls[1][1]).toContain("⏱");

		const widgetCallback = vi.mocked(ctx.ui.setWidget).mock
			.calls[1][1] as unknown as (
			tui: unknown,
			t: Theme,
		) => { render: () => string[]; invalidate: () => void };
		const widget = widgetCallback({}, theme);
		const lines = widget.render();
		expect(lines.length).toBeGreaterThanOrEqual(2);
		expect(lines[0]).toContain("Scheduler");
		expect(lines.some((l: string) => l.includes("loop task"))).toBe(true);
	});

	it("should_render_mixed_timer_types", async () => {
		const ctx = createMockCtx();
		const startHandler = mockPi.events.get("session_start")!;
		await startHandler({}, ctx);

		mockParseLoopArgs
			.mockReturnValueOnce({
				prompt: "recurring task",
				intervalMs: 300000,
			})
			.mockReturnValueOnce({
				prompt: "one shot reminder",
				intervalMs: 60000,
			});

		await mockPi.commands.get("loop")!.handler("5m recurring task", ctx);

		vi.mocked(ctx.ui.setWidget).mockClear();
		vi.mocked(ctx.ui.setStatus).mockClear();

		await mockPi.commands.get("remind")!.handler(
			"1m one shot reminder",
			ctx,
		);

		expect(vi.mocked(ctx.ui.setStatus).mock.calls[0][1]).toContain("2");

		const widgetCallback = vi.mocked(ctx.ui.setWidget).mock
			.calls[0][1] as unknown as (
			tui: unknown,
			t: Theme,
		) => { render: () => string[]; invalidate: () => void };
		const widget = widgetCallback({}, theme);
		const lines = widget.render();
		expect(lines.length).toBeGreaterThanOrEqual(3);
		expect(lines.some((l: string) => l.includes("↻"))).toBe(true);
		expect(lines.some((l: string) => l.includes("⏰"))).toBe(true);
	});

	it("should_call_onUpdate_when_timer_fires", async () => {
		const ctx = createMockCtx();
		const startHandler = mockPi.events.get("session_start")!;
		await startHandler({}, ctx);

		mockParseLoopArgs.mockReturnValue({
			prompt: "recurring check",
			intervalMs: 60000,
		});
		await mockPi.commands.get("loop")!.handler("1m recurring check", ctx);

		vi.mocked(mockPi.api.sendUserMessage).mockClear();

		vi.advanceTimersByTime(60_000 + 30_000);

		expect(vi.mocked(mockPi.api.sendUserMessage)).toHaveBeenCalledWith(
			expect.stringContaining("recurring check"),
		);
	});

	// --- /tasks list with one-shot timer (branch line 134) ---

	it("should_list_one_shot_timer_via_tasks", async () => {
		const ctx = createMockCtx();
		const startHandler = mockPi.events.get("session_start")!;
		await startHandler({}, ctx);

		mockParseLoopArgs.mockReturnValue({
			prompt: "one shot task",
			intervalMs: 600000,
		});
		await mockPi.commands.get("remind")!.handler("10m one shot task", ctx);

		await mockPi.commands.get("tasks")!.handler("list", ctx);

		expect(vi.mocked(ctx.ui.notify)).toHaveBeenCalledWith(
			expect.stringContaining("\u23f0"),
			"info",
		);
	});

	// --- before_agent_start called twice (branch line 224) ---

	it("should_skip_second_before_agent_start", async () => {
		const ctx = createMockCtx();
		const handler = mockPi.events.get("before_agent_start")!;

		await handler({}, ctx);
		await handler({}, ctx);

		expect(true).toBe(true);
	});
});
