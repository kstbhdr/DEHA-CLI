# Implementation and context limits

## Discovery guard

Normal agent tasks that request code changes get a discovery budget of 12 inspection tool calls by default. `DEHA_DISCOVERY_CALLS` changes that budget; a lower explicit limit in the user request takes precedence. After the budget is used, broad scans are denied and the agent can create or edit source/data files, build, test, and run commands. It may make up to two focused reads when a concrete path and purpose are given; a successful source/data edit replenishes those reads. Plans and Markdown notes do not count as implementation progress.

If the model ignores six denied inspection attempts, DEHA interrupts the task and reports that it is incomplete. This limits repeated discovery; it does not guarantee that the model will finish the implementation. Read-only tasks and specialized calls with a custom system prompt do not enable the guard by default. Set `DEHA_IMPLEMENTATION_GUARD=0` to disable it.

## Context window

With `DEHA_MAX_CONTEXT_TOKENS=0`, DEHA infers the context size from the active model name when it recognizes one. An unknown model under the `custom` provider falls back to 32,000 tokens. `/model` now exposes a `Context window` value and saves it to `.env`; enter the model's actual context limit, or enter `0` to return to automatic inference. This controls DEHA's request/context budget and does not change the provider's server-side model limit.

Custom model names are now used by all agent and interactive context calculators, so recognized model names can use their corresponding inferred limit.

## Active project paths

The selected active project directory is the base for relative file paths and the default working directory for shell, Python, Git, and background-job tools. Shell commands are allowed within either the CLI launch directory or the active project root; unrelated paths remain outside the permitted workspace.
