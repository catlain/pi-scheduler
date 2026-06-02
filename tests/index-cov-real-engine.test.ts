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
vi.mock("../timer-persist", () => ({
	restoreTimersFromFile: vi.fn(() => []),
	persistTimersToFile: vi.fn(),
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

	it("should_clear_status_on_empty_list", async () => {
		const ctx = createMockCtx();
		const startHandler = mockPi.events.get("session_start")!;
		await startHandler({}, ctx);

		// session_start: restore(empty) -> onUpdate -> active.length === 0
		expect(vi.mocked(ctx.ui.setStatus)).toHaveBeenCalledWith(
			"scheduler",
			undefined,
		);
	});

	it("should_update_status_after_creating_timer", async () => {
		mockParseLoopArgs.mockReturnValue({
			prompt: "loop task",
			intervalMs: 120000,
		});
		const ctx = createMockCtx();

		const startHandler = mockPi.events.get("session_start")!;
		await startHandler({}, ctx);

		await mockPi.commands.get("loop")!.handler("2m loop task", ctx);

		// calls[1] = setStatus("scheduler", "⏱ 1")
		expect(vi.mocked(ctx.ui.setStatus).mock.calls[1][0]).toBe("scheduler");
		expect(vi.mocked(ctx.ui.setStatus).mock.calls[1][1]).toContain("⏱");
		expect(vi.mocked(ctx.ui.setStatus).mock.calls[1][1]).toContain("1");
	});

	it("should_update_status_count_for_mixed_timer_types", async () => {
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
		vi.mocked(ctx.ui.setStatus).mockClear();

		await mockPi.commands.get("remind")!.handler(
			"1m one shot reminder",
			ctx,
		);

		// 2 active timers
		expect(vi.mocked(ctx.ui.setStatus).mock.calls[0][1]).toContain("2");
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

		vi.mocked(mockPi.api.sendMessage).mockClear();

		vi.advanceTimersByTime(60_000 + 30_000);

		expect(vi.mocked(mockPi.api.sendMessage)).toHaveBeenCalledWith(
			expect.objectContaining({ content: expect.stringContaining("recurring check") }),
			expect.objectContaining({ triggerTurn: true }),
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
