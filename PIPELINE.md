# Optional roles and token budgets

Normal Chat keeps its own model and coding tools. `/config` configures Planner, Coder and Judge individually without walking through unrelated Chat, Vision or Image settings. `/model` remains available for the complete settings wizard.

## Simple checkpoint profile

In `/config` choose **Basit: Planner kontrol noktaları + araçlı Coder**. Choose Planner and Coder models independently in the same menu. Then use `/build <task>`, or use `/build --checkpoints <task>` for a single invocation. Terminal syntax: `deha build "task" --checkpoints`. Existing profiles retain their behavior; `--no-checkpoints` selects the standard workflow for a new task.

The small Coder performs a read-only discovery capped at six tool rounds. Planner then creates 1-8 sequential checkpoints with exact file scopes, implementation instructions, required commands and acceptance criteria. Planner has no tools: it is called once for planning, then for checkpoint reviews. Judge is not called in this profile.

Coder implements only the current checkpoint, runs its declared commands and submits concrete evidence with `task_plan`. Submission never approves a checkpoint. Planner reviews actual disk snapshots and command results, then approves or returns correction instructions. Failed/missing checks, missing declared files, invalid review JSON and newly changed verification requirements keep the checkpoint locked, even if Planner says approve. Checks must run after the latest file-tool edit. File mutation tools reject paths outside the current checkpoint; shell is restricted to exact Planner-declared commands in the project root. This is workflow scoping, not an operating-system sandbox: approved commands can themselves write files.

On rejection the same phase returns to Coder. Planner can revise its allowed files and commands. `PIPELINE_MAX_ITERATIONS` limits attempts **per checkpoint per invocation**; exhausted attempts stop with failure and keep later checkpoints locked. By default a phase has at most 20 Coder tool rounds; an explicit Coder role tool-round limit overrides this. A model review remains fallible, so concrete acceptance checks matter.

Checkpoint state, feedback, review decisions and cumulative attempts are saved in the task plan after each transition. `/code` resumes an unfinished saved checkpoint plan, retaining Planner supervision and skipping approved checkpoints, even if the current profile has changed. A completed saved checkpoint plan makes no model requests. `/plan <task>` in this profile performs Coder discovery and Planner planning only. For a separate independent Judge review use `/judge`; to use the previous full pipeline choose its profile. Explicit `--judge`, block Coder mode and a new checkpoint task with `--no-planner` are rejected as incompatible.

## Standard economy profile

Open `/config`, select the workflow section, then choose **Tasarruf: Planner + araçlı Coder; Judge kapalı**. Configure the Planner with the model you want for planning and Coder with your smaller/local model. Each role has its own provider, model, endpoint, credentials, output token limit, tool-round limit and context limit. The Coder endpoint/model must support structured tool calls; parameter count alone does not establish that capability.

Judge is optional. The economy profile runs Planner once, then sends the compact plan to the tool-using Coder, with at most two implementation attempts. No Judge request is sent when Judge is disabled. A full-review profile and a Coder-only profile are also available. Existing settings default to Planner + block-based Coder + Judge until you choose a different profile, preserving the previous workflow.

## Commands

| Command | Behavior |
| --- | --- |
| `/build <task>` | Uses the configured enabled stages and Coder mode. |
| `/build --no-judge <task>` | Skips Judge for this invocation. |
| `/build --no-planner --no-judge <task>` | Runs only Coder for this invocation. |
| `/build --judge <task>` | Enables Judge for this invocation even if disabled in settings. |
| `/plan <task>` | Runs only Planner and saves a task plan; does not mark implementation complete. |
| `/code` | Resumes the saved plan; a checkpoint plan keeps Planner reviews. Standard plans use Coder alone by default. Completed plans are local no-ops. |
| `/code <task>` | Runs Coder directly for a new task. |
| `/task` | Displays the saved task.md locally, without API requests. |
| `/coderchat` | Toggles direct tool coding with the configured Coder model. |
| `/plannerchat`, `/judgechat` | Toggle independent conversations with those role models. |
| `/judge <file> <task>` | Reviews a file independently. |

Interactive leading options also accept `--planner`, `--no-planner` and `--coder-mode=agent` / `--coder-mode=blocks`. Terminal `deha build` accepts `--no-planner`, `--no-judge`, `--coder-mode agent`, `--plan-only`, `--use-saved-plan` and the per-role model/provider/key/URL flags.

## Persistent task plan

Each run saves `.deha/tasks/<id>/task.md` plus machine state; `.deha/task.md` mirrors the latest plan. The project root's own `task.md` is not overwritten. The Coder's `task_plan` tool updates numbered steps and requires concrete evidence before marking a step done. State is saved immediately and `/code` can load it after a CLI restart. The machine state is authoritative; edit requests should be given to the model rather than manually editing the rendered Markdown mirror.

The agent Coder cannot finish the pipeline while saved checklist steps remain open. It must execute implementation/validation tools; a completion sentence alone is insufficient. A bounded Coder retry loop handles incomplete work; Planner is not re-run for each retry. Judge failures also return to Coder. Model-reported checklist evidence can still be wrong: skipping Judge means there is no independent model review. `applied` and `Judge not run` are displayed instead of a fabricated Judge PASS.

Block mode retains FILE/EDIT output application. It cannot overwrite an existing file with a NEW FILE block. When Judge is off, block output must report completed checklist items as `STEP_DONE: <1-based index> | <concrete evidence>`; otherwise unfinished steps prevent completion. With Judge enabled, full-task approval may close the block-mode checklist. Applied project edits remain on disk after failure or cancellation for inspection and correction.

## Token savings and limits

- Planner sees at most `PIPELINE_HISTORY_TOKENS` (default approximately 2000 tokens) of old chat, once. Set 0 to omit it. Pinned architecture/static project context remains available.
- Tool mode uses compact planning/coding prompts. Planner hands off file/function references and constraints instead of copying every source file and inspection result.
- Coder and Judge receive the plan and relevant current evidence, not the whole Planner tool transcript or all past Coder responses.
- Tool Coder receives only coding/file/shell/job tools. Role output/context/tool-round budgets apply separately. Context limits must match the actual server/model configuration.
- `/stats` attributes agent Planner/Coder work to the corresponding roles. Cost estimates still depend on the prices configured in `.env`.

The local Ollama tool path uses its [OpenAI-compatible endpoint](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx); it does not require a real API key for a local server. This does not guarantee a particular small model's tool-call accuracy.

Judge PASS is a model review, not proof that runtime tests ran. Agent Coder can run tests and its tool evidence is passed to review. Current file snapshots are bounded to 40,000 characters total and 16,000 per file.

## Verification and rollback

`npm run build`, `npm test -- --testTimeout=20000`, `node scripts/pipeline-smoke.cjs`, `node scripts/pipeline-economy-smoke.cjs` and `node scripts/pipeline-checkpoint-smoke.cjs` use local fixtures, not paid APIs. The checkpoint smoke verifies real file/shell operations, correction gates, malformed reviews and completed resume with zero Judge requests. Unit tests also cover resume after a failed later checkpoint and cancellation during review. These do not load or benchmark an actual Qwen model.

The version before checkpoint supervision is `backup/pre-checkpoint-build-20261027` (b4d9bd4). To restore it after saving local changes: `git switch --detach backup/pre-checkpoint-build-20261027`, then `npm run build && npm link --ignore-scripts`.

The version before optional workflows is `backup/pre-optional-pipeline-20261027` (5e13de6). Save local source changes before switching:

```bash
git fetch origin --tags
git switch --detach backup/pre-optional-pipeline-20261027
npm run build && npm link --ignore-scripts
```

Return to current main: `git switch main && git pull --ff-only origin main && npm run build && npm link --ignore-scripts`.
