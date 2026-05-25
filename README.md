# pi-scheduler

Timer and recurring task extension for [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent) — scheduled messages, interval-based prompts, and task automation.

## What It Does

Sometimes you need your AI agent to do things on a schedule — remind you to commit every 30 minutes, check build status periodically, or send a notification at a specific time. pi-scheduler adds **time-based automation** to pi:

- **One-time reminders** — "Remind me in 10 minutes to check the tests"
- **Recurring tasks** — "Every 5 minutes, check if the server is responding"
- **Timed prompts** — Inject messages into the agent's context at scheduled times
- **Task management** — List, cancel, and monitor active timers

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

- **Commit discipline** — Remind yourself to commit every 30 minutes during long sessions
- **Monitoring** — Periodically check server status or build progress
- **Time-boxing** — Set a reminder when you've spent too long on a task
- **Batch processing** — Trigger periodic data processing steps

## Dependencies

- `@earendil-works/pi-coding-agent` — ExtensionAPI (peer)

## License

MIT
