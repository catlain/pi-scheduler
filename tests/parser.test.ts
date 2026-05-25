/**
 * parser.ts 测试 — /loop 和 /remind 的参数解析
 */

import { describe, it, expect } from "vitest";
import { parseLoopArgs, parseInterval } from "../parser";

describe("parseInterval", () => {
  it("should_parse_minutes_when_suffix_m", () => {
    expect(parseInterval("5m")).toBe(5 * 60_000);
  });

  it("should_parse_hours_when_suffix_h", () => {
    expect(parseInterval("2h")).toBe(2 * 3_600_000);
  });

  it("should_parse_days_when_suffix_d", () => {
    expect(parseInterval("1d")).toBe(86_400_000);
  });

  it("should_round_up_seconds_to_1_minute", () => {
    expect(parseInterval("1s")).toBe(60_000);
    expect(parseInterval("30s")).toBe(60_000);
  });

  it("should_return_null_when_no_match", () => {
    expect(parseInterval("hello")).toBeNull();
    expect(parseInterval("")).toBeNull();
  });
});

describe("parseLoopArgs", () => {
  it("should_extract_prefix_interval_and_prompt", () => {
    const result = parseLoopArgs("5m check deploy");
    expect(result.intervalMs).toBe(300_000);
    expect(result.prompt).toBe("check deploy");
  });

  it("should_extract_trailing_every_interval", () => {
    const result = parseLoopArgs("check deploy every 20m");
    expect(result.intervalMs).toBe(1_200_000);
    expect(result.prompt).toBe("check deploy");
  });

  it("should_use_default_10m_when_no_interval", () => {
    const result = parseLoopArgs("check deploy");
    expect(result.intervalMs).toBe(600_000);
    expect(result.prompt).toBe("check deploy");
  });

  it("should_return_null_prompt_when_empty_input", () => {
    const result = parseLoopArgs("");
    expect(result.intervalMs).toBe(600_000);
    expect(result.prompt).toBeNull();
  });

  it("should_prioritize_prefix_over_trailing_every", () => {
    // 规则 1 优先于规则 2
    const result = parseLoopArgs("5m check every 20m");
    expect(result.intervalMs).toBe(300_000);
    expect(result.prompt).toBe("check every 20m");
  });

  it("should_round_up_seconds_interval_to_minute", () => {
    const result = parseLoopArgs("1s fast");
    expect(result.intervalMs).toBe(60_000);
    expect(result.prompt).toBe("fast");
  });

  it("should_parse_hours_correctly", () => {
    const result = parseLoopArgs("2h long task");
    expect(result.intervalMs).toBe(7_200_000);
    expect(result.prompt).toBe("long task");
  });

  it("should_not_match_every_without_time_unit", () => {
    // "check every PR" 不应匹配规则 2
    const result = parseLoopArgs("check every PR");
    expect(result.intervalMs).toBe(600_000); // 默认 10m
    expect(result.prompt).toBe("check every PR");
  });
});
