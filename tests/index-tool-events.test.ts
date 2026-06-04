/**
 * index.ts 测试 — schedule 工具 + 事件
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("../parser", () => ({
	parseLoopArgs: vi.fn(),
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
		sendMessage: vi.fn(),
		appendEntry: vi.fn(),
	} as unknown as ExtensionAPI;
	return { api, commands, tools, events };
}

function createMockCtx(
	overrides?: Partial<ExtensionContext>,
): ExtensionContext {
	return {
		cwd: "/tmp/test",
		ui: { notify: vi.fn(), setStatus: vi.fn(), setWidget: vi.fn() },
		sessionManager: {
			getEntries: vi.fn(() => []),
			getSessionId: vi.fn(() => "test-session-id"),
		},
		...overrides,
	} as unknown as ExtensionContext;
}

describe("scheduler tool + events", () => {
	let mockPi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockPi = createMockPi();
		mockEngine.create.mockReturnValue({
			id: "t1",
			prompt: "test",
			intervalMs: 60000,
			recurring: false,
			status: "active",
			firedCount: 0,
		});
		mockEngine.list.mockReturnValue([]);
		schedulerExtension(mockPi.api);
	});

	// --- schedule 工具 ---

	it("should_create_timer_via_tool", async () => {
		const tool = mockPi.tools.get("schedule")!;
		const result = await tool.execute("tc1", {
			action: "create",
			interval_ms: 60000,
			prompt: "remind me",
		});
		expect(mockEngine.create).toHaveBeenCalledWith("remind me", 60000, false);
		expect(result.content[0].text).toContain("定时任务已创建");
	});

	it("should_create_recurring_timer_via_tool", async () => {
		const tool = mockPi.tools.get("schedule")!;
		await tool.execute("tc1", {
			action: "create",
			interval_ms: 300000,
			prompt: "check",
			recurring: true,
		});
		expect(mockEngine.create).toHaveBeenCalledWith("check", 300000, true);
	});

	it("should_reject_create_without_required_params", async () => {
		const tool = mockPi.tools.get("schedule")!;
		const result = await tool.execute("tc1", { action: "create" });
		expect(result.content[0].text).toContain("缺少");
	});

	it("should_list_active_timers_via_tool", async () => {
		mockEngine.list.mockReturnValue([
			{
				id: "t1",
				prompt: "check",
				intervalMs: 300000,
				recurring: true,
				status: "active",
				expiresAt: Date.now() + 200000,
				firedCount: 0,
			},
		]);
		const tool = mockPi.tools.get("schedule")!;
		const result = await tool.execute("tc1", { action: "list" });
		expect(result.content[0].text).toContain("check");
	});

	it("should_show_empty_when_no_timers_via_tool", async () => {
		mockEngine.list.mockReturnValue([]);
		const tool = mockPi.tools.get("schedule")!;
		const result = await tool.execute("tc1", { action: "list" });
		expect(result.content[0].text).toContain("没有");
	});

	it("should_cancel_timer_via_tool", async () => {
		mockEngine.cancel.mockReturnValue(true);
		const tool = mockPi.tools.get("schedule")!;
		const result = await tool.execute("tc1", { action: "cancel", id: "t1" });
		expect(mockEngine.cancel).toHaveBeenCalledWith("t1");
		expect(result.content[0].text).toContain("已取消");
	});

	it("should_report_not_found_on_cancel_unknown_via_tool", async () => {
		mockEngine.cancel.mockReturnValue(false);
		const tool = mockPi.tools.get("schedule")!;
		const result = await tool.execute("tc1", { action: "cancel", id: "xxx" });
		expect(result.content[0].text).toContain("未找到");
	});

	it("should_reject_unknown_action_via_tool", async () => {
		const tool = mockPi.tools.get("schedule")!;
		const result = await tool.execute("tc1", { action: "foobar" });
		expect(result.content[0].text).toContain("未知");
	});

	// --- 事件 ---

	it("should_cleanup_on_session_shutdown", async () => {
		const handler = mockPi.events.get("session_shutdown")!;
		await handler({}, createMockCtx());
		expect(mockEngine.cleanup).toHaveBeenCalled();
	});

	it("should_restore_on_session_start", async () => {
		const handler = mockPi.events.get("session_start")!;
		const ctx = createMockCtx();
		await handler({}, ctx);
		expect(mockEngine.restore).toHaveBeenCalled();
	});

	it("should_lazy_restore_on_before_agent_start", async () => {
		const handler = mockPi.events.get("before_agent_start")!;
		const ctx = createMockCtx();
		await handler({}, ctx);
		// 第一次触发，没有 scheduler entries → 不恢复
		expect(mockEngine.restore).not.toHaveBeenCalled();
	});

	it("should_restore_on_before_agent_start_with_entries", async () => {
		const handler = mockPi.events.get("before_agent_start")!;
		const ctx = createMockCtx({
			sessionManager: {
				getEntries: vi.fn(() => [
					{ type: "custom", customType: "scheduler", data: {} },
				]),
			},
		} as any);
		await handler({}, ctx);
		expect(mockEngine.restore).toHaveBeenCalled();
	});
});
