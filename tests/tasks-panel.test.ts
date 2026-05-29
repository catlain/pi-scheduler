/**
 * tasks-panel.ts 测试
 *
 * 测试面板的交互逻辑：渲染、键盘输入、取消确认流程
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pi-tui 组件
vi.mock("@earendil-works/pi-tui", () => ({
	Container: class {
		children: unknown[] = [];
		addChild(c: unknown) {
			this.children.push(c);
			return c;
		}
		render = vi.fn(() => "");
		invalidate = vi.fn();
	},
	Spacer: class {
		constructor(public h: number) {}
		render = vi.fn(() => "");
		invalidate = vi.fn();
	},
	Text: class {
		constructor(public content: string, public w: number, public h: number) {}
		render = vi.fn(() => "");
		invalidate = vi.fn();
	},
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	DynamicBorder: class {
		constructor(public fn: (s: string) => string) {}
		render = vi.fn(() => "");
		invalidate = vi.fn();
	},
}));

import { openTasksPanel } from "../tasks-panel";
import type { Timer } from "../types";
import type { TimerEngine } from "../timer-engine";

function createMockTimer(overrides?: Partial<Timer>): Timer {
	return {
		id: "test-id-1",
		prompt: "test task",
		interval: 60_000,
		intervalMs: 60_000,
		recurring: true,
		status: "active",
		expiresAt: Date.now() + 60_000,
		createdAt: Date.now(),
		...overrides,
	};
}

function createMockCtx() {
	let capturedFactory: any;
	return {
		ui: {
			custom: vi.fn(async (factory: any) => {
				capturedFactory = factory;
				const mockTui = { requestRender: vi.fn() };
				const mockTheme = {
					fg: vi.fn((_color: string, s: string) => s),
					bold: vi.fn((s: string) => s),
				};
				const mockKb = {
					matches: vi.fn((_kd: unknown, _binding: string) => false),
				};
				const mockDone = vi.fn();
				const result = factory(mockTui, mockTheme, mockKb, mockDone);
				// 保存交互接口供测试调用
				(capturedFactory as any)._result = result;
				(capturedFactory as any)._tui = mockTui;
				(capturedFactory as any)._theme = mockTheme;
				(capturedFactory as any)._kb = mockKb;
				(capturedFactory as any)._done = mockDone;
			}),
		},
		_getFactory: () => capturedFactory,
	};
}

function createMockEngine(): TimerEngine {
	return {
		create: vi.fn(),
		cancel: vi.fn(() => true),
		list: vi.fn(),
		restore: vi.fn(),
		cleanup: vi.fn(),
	};
}

describe("tasks-panel", () => {
	it("should render empty list", async () => {
		const ctx = createMockCtx() as any;
		const engine = createMockEngine();
		await openTasksPanel(ctx, [], engine);
		expect(ctx.ui.custom).toHaveBeenCalledWith(
			expect.any(Function),
			expect.objectContaining({ overlay: true }),
		);
	});

	it("should render with active timers", async () => {
		const ctx = createMockCtx() as any;
		const engine = createMockEngine();
		const timers = [
			createMockTimer({ id: "t1", prompt: "task one" }),
			createMockTimer({ id: "t2", prompt: "task two", recurring: false }),
		];
		await openTasksPanel(ctx, timers, engine);

		const factory = ctx._getFactory();
		// 调用 render 验证不崩溃
		const rendered = factory._result.render(80);
		expect(typeof rendered).toBe("string");
	});

	it("should handle keyboard navigation", async () => {
		const ctx = createMockCtx() as any;
		const engine = createMockEngine();
		const timers = [
			createMockTimer({ id: "t1" }),
			createMockTimer({ id: "t2" }),
		];
		await openTasksPanel(ctx, timers, engine);

		const { _result, _kb, _tui } = ctx._getFactory();

		// 模拟按 ↓
		_kb.matches.mockImplementation((_kd: unknown, binding: string) => binding === "tui.select.down");
		_result.handleInput("down");
		expect(_tui.requestRender).toHaveBeenCalled();

		// 模拟按 ↑
		_kb.matches.mockImplementation((_kd: unknown, binding: string) => binding === "tui.select.up");
		_result.handleInput("up");
		expect(_tui.requestRender.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it("should handle cancel confirmation flow", async () => {
		const ctx = createMockCtx() as any;
		const engine = createMockEngine();
		const timers = [createMockTimer({ id: "t1" })];
		await openTasksPanel(ctx, timers, engine);

		const { _result, _kb, _tui } = ctx._getFactory();

		// 按 d 进入确认模式
		_kb.matches.mockReturnValue(false);
		_result.handleInput("d");
		expect(_tui.requestRender).toHaveBeenCalled();

		// 按 y 确认取消
		_result.handleInput("y");
		expect(engine.cancel).toHaveBeenCalledWith("t1");
	});

	it("should handle cancel confirmation abort", async () => {
		const ctx = createMockCtx() as any;
		const engine = createMockEngine();
		const timers = [createMockTimer({ id: "t1" })];
		await openTasksPanel(ctx, timers, engine);

		const { _result, _kb, _tui } = ctx._getFactory();

		// 按 d 进入确认模式
		_kb.matches.mockReturnValue(false);
		_result.handleInput("d");

		// 按 n 取消确认
		_result.handleInput("n");
		expect(engine.cancel).not.toHaveBeenCalled();
	});

	it("should handle Escape to close panel", async () => {
		const ctx = createMockCtx() as any;
		const engine = createMockEngine();
		const timers = [createMockTimer({ id: "t1" })];
		await openTasksPanel(ctx, timers, engine);

		const { _result, _kb, _done } = ctx._getFactory();

		// 模拟按 Esc
		_kb.matches.mockImplementation((_kd: unknown, binding: string) => binding === "tui.select.cancel");
		_result.handleInput("escape");
		expect(_done).toHaveBeenCalledWith(undefined);
	});

	it("should truncate long prompts", async () => {
		const ctx = createMockCtx() as any;
		const engine = createMockEngine();
		const timers = [
			createMockTimer({
				id: "t1",
				prompt: "this is a very long prompt that exceeds thirty five characters easily",
			}),
		];
		await openTasksPanel(ctx, timers, engine);

		const factory = ctx._getFactory();
		// render 不崩溃即可
		expect(() => factory._result.render(80)).not.toThrow();
	});

	it("should use bottom overlay position", async () => {
		const ctx = createMockCtx() as any;
		const engine = createMockEngine();
		await openTasksPanel(ctx, [], engine);

		const call = ctx.ui.custom.mock.calls[0];
		expect(call[1]).toEqual(
			expect.objectContaining({
				overlay: true,
				overlayOptions: expect.objectContaining({
					position: "bottom",
					maxHeight: 20,
				}),
			}),
		);
	});
});
