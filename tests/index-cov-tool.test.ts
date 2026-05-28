/**
 * index.ts 覆盖率补充测试 — 工具命令 / loop.md 路径
 *
 * 覆盖：
 * - 第 92 行: /loop 找到 loop.md 的内容分支
 * - 第 192 行: schedule 工具 cancel 缺少 id 参数
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

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

describe("index.ts coverage: /loop + tool paths", () => {
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

	it("should_use_loop_md_content_when_no_args", async () => {
		mockParseLoopArgs.mockReturnValue({
			prompt: null,
			intervalMs: 300000,
		});

		const tmpDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "scheduler-cov-"),
		);
		fs.mkdirSync(path.join(tmpDir, ".pi"), { recursive: true });
		fs.writeFileSync(
			path.join(tmpDir, ".pi", "loop.md"),
			"auto loop task content  ",
		);

		try {
			const ctx = createMockCtx({ cwd: tmpDir });
			await mockPi.commands.get("loop")!.handler("", ctx);

			expect(vi.mocked(ctx.ui.notify)).toHaveBeenCalledWith(
				expect.stringContaining("循环任务已创建"),
				"info",
			);
			expect(vi.mocked(ctx.ui.notify).mock.calls[0][0]).toContain(
				"auto loop task content",
			);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("should_reject_tool_cancel_without_id", async () => {
		const tool = mockPi.tools.get("schedule")!;
		const result = await tool.execute("tc1", { action: "cancel" });
		expect(result.content[0].text).toContain("缺少 id 参数");
	});

	it("should_reject_tool_cancel_with_empty_id", async () => {
		const tool = mockPi.tools.get("schedule")!;
		const result = await tool.execute("tc1", {
			action: "cancel",
			id: "",
		});
		expect(result.content[0].text).toContain("缺少 id 参数");
	});

	// --- schedule tool list with one-shot timer (branch line 184) ---

	it("should_list_one_shot_timer_via_tool", async () => {
		const tool = mockPi.tools.get("schedule")!;

		await tool.execute("tc1", {
			action: "create",
			prompt: "one shot via tool",
			interval_ms: 600000,
			recurring: false,
		});

		const result = await tool.execute("tc1", { action: "list" });
		expect(result.content[0].text).toContain("\u23f0");
		expect(result.content[0].text).toContain("one shot via tool");
	});
});
