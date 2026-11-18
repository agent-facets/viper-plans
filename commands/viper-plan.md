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
   - If persistence fails, report the failure to the user and stop. Do not offer to execute the plan.
7. Do not implement anything during planning. Execution starts only through the handoff below.

## Execution Handoff

After the plan is persisted successfully, use the `question` tool to ask: "Execute **<name>** now?" Offer exactly two options:

- **Run now** — execute the saved plan in this session.
- **Not now** — keep the plan for later.

### Run now

The user already approved this plan, so do not ask again whether to run it. Do not list plans, show a picker, display the plan, or ask for an initial execution confirmation.

1. Load the `viper-execution-rules` skill.
2. Read `.opencode/plans/<name>/plan.md` fresh, using the exact name you just persisted. If the `viper-read-plan` tool is available, use it. Otherwise, read the file directly with your file tools. The saved file is the source of truth: use its step headings and its pause mode, not the copy in the conversation.
3. If the read fails or the plan is missing, report the error and stop. Never select or run a different plan.
4. State in one line which plan you are executing and how many steps it has (e.g. "Executing plan **<name>** (<N> steps)."), then follow the `viper-execution-rules` protocol:
   - Create one TODO per step heading
   - Execute steps in order following the VIPER protocol
   - Gate Propose and Review steps on user approval/feedback
   - Stop on Verify failures
   - Enforce hard rules (Explore→Propose before Implement, Verify after Implement)
5. Once complete, ask the user if they want to delete the plan with the `question` tool using a simple yes/no binary. If they answer yes: if the `viper-delete-plan` tool is available, use it. Otherwise, recursively remove the entire `.opencode/plans/<name>/` directory and all of its contents with your file tools, leaving no orphaned files or empty directory behind.

### Not now

Keep the plan. Tell the user they can run it later with `/viper-run <name>`, using the exact plan name.
