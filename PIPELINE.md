# Planner, Coder and Judge

Normal interactive messages continue to use the Chat provider/model and coding tools. To deliberately use the three configured roles, enter `/build <task>` inside DEHA, or run `deha build "<task>"` from the project directory.

Configure Chat, Planner, Coder and Judge independently with `/model`. Using `/build` does not switch the normal Chat model. `/plannerchat` and `/judgechat` select those roles for separate conversations, with their own model, endpoint and credentials.

## Build stages

1. Planner inspects the project with tools and returns a complete plan, including the exact current snippets needed for edits. Its completion marks only the planning stage, not the whole build.
2. Coder uses its configured model to return new `FILE:` blocks or exact `EDIT:` blocks. In this pipeline, Coder does not call tools directly; DEHA applies the returned blocks to the active project using its normal file access checks. A `FILE:` block cannot overwrite an existing file.
3. Judge reviews the original task, plan, all Coder iterations, application results and bounded snapshots of the current files. Failed edits and missing implementation blocks prevent PASS even if the model returns PASS. Failed reviews return to Coder with feedback and file evidence, up to the configured iteration limit (maximum five).

PASS means model review of the complete change; it does not by itself mean that runtime tests were executed. The file snapshots provided for review are limited to 40,000 characters in total and 16,000 characters per file. Large changes may need smaller tasks or a separate review. Applied project changes remain on disk after a failed review or cancellation so they can be inspected and corrected.

Cancellation reaches in-flight Planner, Coder and Judge requests. An unsuccessful `deha build` exits with code 1; an interrupted/failed task remains incomplete in session memory.

## Local verification

`npm run build`, `npx vitest run src/__tests__/pipeline.test.ts --testTimeout=20000` and `node scripts/pipeline-smoke.cjs` verify the pipeline without paid APIs. The smoke test launches the real CLI against a local HTTP provider, uses three distinct role models/endpoints/keys, deliberately produces a failed edit and an incorrect PASS, verifies correction on disk, then verifies normal interactive Chat coding and in-flight request cancellation.

## Source rollback

The source version immediately before these pipeline changes is tagged `backup/pre-pipeline-review-20261027` (107dece). Save any local source changes before switching:

```bash
git fetch origin --tags
git switch --detach backup/pre-pipeline-review-20261027
npm run build && npm link --ignore-scripts
```

To return to current main: `git switch main && git pull --ff-only origin main && npm run build && npm link --ignore-scripts`.
