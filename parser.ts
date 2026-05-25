/**
 * 解析 /loop 和 /remind 的参数
 *
 * 规则（按优先级）：
 * 1. 前缀 token 匹配 \d+[smhd] → 提取为间隔，剩余为 prompt
 * 2. 尾部匹配 "every \d+[smhd]" → 提取为间隔，前面为 prompt
 * 3. 默认 10m，整个输入为 prompt
 * 4. 输入为空 → interval=10m，prompt=null（使用 loop.md）
 */

/** 解析单个间隔 token（如 "5m"、"2h"），返回毫秒数 */
export function parseInterval(token: string): number | null {
  const match = token.match(/^(\d+)([smhd])$/);
  if (!match) return null;

  const n = parseInt(match[1], 10);
  const unit = match[2];

  let ms: number;
  switch (unit) {
    case "s":
      ms = n * 1000;
      break;
    case "m":
      ms = n * 60_000;
      break;
    case "h":
      ms = n * 3_600_000;
      break;
    case "d":
      ms = n * 86_400_000;
      break;
    default:
      return null;
  }

  // 最小粒度 1 分钟
  return Math.max(ms, 60_000);
}

export interface LoopArgs {
  intervalMs: number;
  prompt: string | null;
}

/** 解析 /loop 参数 */
export function parseLoopArgs(input: string): LoopArgs {
  const DEFAULT_MS = 600_000; // 10m
  const trimmed = input.trim();

  if (!trimmed) {
    return { intervalMs: DEFAULT_MS, prompt: null };
  }

  // 规则 1：前缀 token 匹配 \d+[smhd]
  const prefixMatch = trimmed.match(/^(\d+[smhd])\s+(.+)/);
  if (prefixMatch) {
    const ms = parseInterval(prefixMatch[1]);
    if (ms !== null) {
      return { intervalMs: ms, prompt: prefixMatch[2].trim() };
    }
  }

  // 规则 2：尾部 "every \d+[smhd]"
  const everyMatch = trimmed.match(/(.+?)\s+every\s+(\d+[smhd])$/);
  if (everyMatch) {
    const ms = parseInterval(everyMatch[2]);
    if (ms !== null) {
      return { intervalMs: ms, prompt: everyMatch[1].trim() };
    }
  }

  // 规则 3：默认 10m
  return { intervalMs: DEFAULT_MS, prompt: trimmed };
}
