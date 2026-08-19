Load the `viper-planning` skill for guidance on plan structure.

If the user provided a goal as arguments, use it. Otherwise, ask what they'd like to do. Only use the `question` tool if you need to ask multiple choice questions.

## Plan tools

The `viper-plans` MCP server provides `viper-write-plan`, `viper-read-plan`, `viper-edit-plan`,
`viper-list-plans`, and `viper-delete-plan`. A client may expose them under a prefixed name such as
`viper-plans_viper-read-plan`, so treat any tool whose name ends with one of those canonical names as
that tool. Prefer them whenever they are available; when they are not, use the file-tool fallbacks
described below.

## Goal

$ARGUMENTS

## Workflow

1. Think, read, search, and explore to understand the problem
2. Ask the user clarifying questions — don't make large assumptions about intent
3. Compose VIPER steps that match the shape of the change (not every change needs all 6 types). Include `Pause` steps at every exploration⇄implementation boundary as described in the `viper-planning` skill.
4. Display the plan to the user in full for review
5. Use the `question` tool to ask the user to approve the plan before implementation. Offer three options:
   - **Approve with pauses** — persist the plan as composed, keeping the `Pause` steps (default/recommended). The executor runs it in pause-enabled mode and enforces model-switch boundaries.
   - **Approve without pauses** — before persisting, remove every `Pause` step and renumber the remaining steps sequentially. The persisted plan contains no `Pause` steps and is a valid pause-free plan; the executor runs it without model-switch-boundary enforcement.
   - **Request changes** — the user will describe what to adjust (custom input)

   If they request changes, update the plan and ask again until approved.
6. Once approved, persist the plan (with `Pause` steps kept or stripped per the choice above): if the `viper-write-plan` tool is available, use it. Otherwise, create the directory `.opencode/plans/<name>/` and write the plan to `.opencode/plans/<name>/plan.md` directly with your file tools.
7. Do not try to implement — planning and execution are separate concerns

Tell the user they may use `/viper-run` to select and execute any plan, or `/viper-continue` to immediately run the plan just created.
