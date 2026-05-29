> 📖 **[pi-atelier 实战指南](https://catlain.github.io/pi-atelier/)** — 从零教会你使用 pi-atelier 扩展生态，包含完整示例和最佳实践。

[English](README.en.md) | 程序中文文档

# pi-scheduler

[源码仓库](https://github.com/catlain/pi-scheduler) | [npm](https://www.npmjs.com/package/pi-ate-scheduler)

Timer and recurring task extension for [pi](https://github.com/earendil-works/pi-coding-agent) — scheduled messages, interval-based prompts, and task automation.

## Why You Need It

Sometimes you need your AI agent to do things on a schedule — remind you to commit every 30 minutes, check build status periodically, or send a notification at a specific time. Without pi-scheduler, you'd have to manually trigger these actions yourself.

pi-scheduler adds **time-based automation** to pi:

- **One-time reminders** — "Remind me in 10 minutes to check the tests"
- **Recurring tasks** — "Every 5 minutes, check if the server is responding"
- **Timed prompts** — Inject messages into the agent's context at scheduled times
- **Task management** — List, cancel, and monitor active timers

## How It Works

```
User/Agent: "Remind me in 10 min to check tests"
        │
        ▼
schedule(action: "create", interval_ms: 600000, prompt: "Check tests")
        │
        ▼
TimerEngine registers timer
        │
        ├── one-shot (recurring=false): fires once after interval
        └── loop (recurring=true): fires every interval
        │
        ▼ when timer fires
Prompt injected into agent context
        │
        ▼
Agent processes the prompt like a user message
```

## Installation

```bash
pi install git:github.com/catlain/pi-scheduler
```

## Commands

| Command | Description |
|---------|-------------|
| `/loop` | List active recurring tasks |
| `/remind` | List active one-time reminders |
| `/tasks` | List all active tasks (reminders + loops) |

## Tool: `schedule`

Create, list, and cancel scheduled tasks:

| Action | Description |
|--------|-------------|
| `create` | Create a new scheduled task (one-time or recurring) |
| `list` | List all active tasks |
| `cancel` | Cancel a task by ID |

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `create`, `list`, or `cancel` |
| `id` | string | for cancel | Task ID to cancel |
| `prompt` | string | for create | Message to inject when timer fires |
| `interval_ms` | number | for create | Interval in milliseconds |
| `recurring` | boolean | for create | `true` = repeating, `false` = one-shot (default) |

## Examples

### One-time reminder
```
schedule(action: "create", prompt: "Check if tests pass", interval_ms: 600000)
// Fires once after 10 minutes
```

### Recurring task
```
schedule(action: "create", prompt: "Commit current changes", interval_ms: 1800000, recurring: true)
// Fires every 30 minutes
```

### List active tasks
```
schedule(action: "list")
```

### Cancel a task
```
schedule(action: "cancel", id: "task-abc123")
```

## Use Cases

| Scenario | Config |
|----------|--------|
| **Commit discipline** | Recurring every 30 min: "Commit current changes" |
| **Monitoring** | Recurring every 5 min: "Check server status" |
| **Time-boxing** | One-shot after 60 min: "You've spent over an hour on this task" |
| **Build check** | One-shot after 2 min: "Check if CI build passed" |
| **Periodic review** | Recurring every 20 min: "Review what you've done so far" |

## Best Practices

### ✅ Recommended
- Use human-readable prompts — they're injected directly into the agent's context
- Set reasonable intervals (≥ 1 minute) — too frequent will flood the context
- Use `/tasks` to review active tasks before creating new ones
- Cancel tasks you no longer need to free up context

### ❌ Not Recommended
- Don't set intervals < 30 seconds — the agent can't respond that fast
- Don't create many recurring tasks simultaneously — context pollution
- Don't use for critical scheduling — timers are lost when pi restarts

## Limitations

| Limitation | Detail |
|------------|--------|
| No persistence | Timers are in-memory only, lost on restart |
| No cron syntax | Intervals only (milliseconds), no cron expressions |
| Context injection | Prompt occupies context space when it fires |
| No deduplication | Creating identical tasks results in duplicates |

## Architecture

```
pi-scheduler/
├── index.ts          # Entry: register schedule tool + slash commands
├── timer-engine.ts   # Core timer management (create/list/cancel)
├── parser.ts         # Natural language time parsing ("10 min" → ms)
├── types.ts          # Timer type definitions
├── tests/            # Unit tests
└── package.json
```

**Dependencies**:
- `@earendil-works/pi-coding-agent` — ExtensionAPI (peer)

## License

MIT
