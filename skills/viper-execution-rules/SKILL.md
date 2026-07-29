# VIPER Plan Execution

This skill describes how to execute plans that follow the VIPER step model. It covers loading plans, creating TODOs, and the step execution protocol.

## Loading a Plan

When executing a plan (from a file or inline):

1. Read the plan fully before doing anything
2. Look for the `## Step Types` legend — it defines how each step type must be executed
3. Create TODOs from the step headings

## TODO Creation Rules

**Create exactly ONE TODO item per `### Step <N> - <Type>: <Description>` heading in the plan.**

- The TODO content MUST match the step heading: `<Type>: <Description>`
- NEVER combine steps into a single TODO
- NEVER skip steps
- Each TODO MUST maps to exactly one step heading
- You MUST NOT include the step number in the TODO content — only the type and description

### Example

```
CORRECT:
- Explore: Understand the widget registry       [in_progress]
- Propose: Add FooWidget to the registry         [pending]
- Implement: Add FooWidget to the registry       [pending]
- Verify: Lint and test the widget registry      [pending]

WRONG:
- Explore + Propose: Widget registry             [in_progress]
- Implement and Verify: FooWidget                [pending]
```

## Step Execution Protocol

Before executing ANY step, check its type prefix and follow the corresponding rules:

### Explore Steps (READ-ONLY)

1. Read files, search the codebase, investigate broadly
2. **DO NOT write, edit, or create ANY files**
3. Summarize findings — these inform subsequent Propose or Review steps
4. Mark complete and proceed to the next step

### Propose Steps (READ-ONLY + USER GATE)

1. Read the relevant files mentioned in the step
2. **Present the full proposal as regular assistant output text** — include current code, intended changes, rationale, and any other details the user needs to make a decision. All of this goes in your message text, NOT in the `question` MCP tool.
3. **After** presenting the proposal, use the `question` MCP tool with a short approval prompt. The question must be concise (e.g., "Do you approve this change?") with three options:
   - **Approve** — Proceed with the proposed changes
   - **Reject** — Do not make this change
   - **Request changes** — The user will describe what to adjust (custom input)
4. **NEVER put detailed explanations, code snippets, or rationale inside the `question` MCP tool options or descriptions.** The question tool is only for the approval gate — all substance goes in the assistant message above it.
5. **DO NOT write, edit, or create ANY files during a Propose step**
6. **DO NOT proceed to the next step until the user approves**

If the user requests changes, revise the proposal and present + ask again.

### Implement Steps (WRITE)

1. If a preceding Propose step exists for this change, it MUST have explicit user approval before proceeding
2. Make the code changes described in the step (or in the approved proposal)
3. Do not add, remove, or modify anything beyond what the step specifies

### Review Steps (READ-ONLY + USER GATE)

1. Analyze what was done or found — read code, examine changes, assess quality
2. **Present your full findings and analysis as regular assistant output text.** Include all relevant details, code references, and observations in your message — NOT in the `question` MCP tool.
3. **After** presenting your analysis, use the `question` MCP tool with a short feedback prompt. The question must be concise (e.g., "How would you like to proceed?") with options like:
   - **Looks good, continue** — Proceed to the next step
   - **I have concerns** — The user will describe their concerns (custom input)
4. **NEVER put detailed findings, code snippets, or analysis inside the `question` MCP tool options or descriptions.** The question tool is only for the gate — all substance goes in the assistant message above it.
5. **DO NOT write, edit, or create ANY files during a Review step**
6. **DO NOT proceed to the next step until the user responds**

If the user has concerns, address them before moving on.

### Pause Steps (PAUSE, NO TOOL)

A Pause step exists so the user can switch models before the next phase block
(exploration ⇄ implementation). It is NOT a feedback gate — unlike Review, it
never calls the `question` MCP tool. Execute it as follows:

1. Mark its TODO `in_progress`.
2. Emit exactly this line of plain assistant text, and nothing else:

   ```
   Switch models if desired, then send any message to continue.
   ```

   Do not name the phase, summarize the next step, or tell the user to run
   `/viper-run`, `/viper-continue`, or any other command — the run resumes on
   any message.
3. **Do NOT call the `question` MCP tool.** Some harnesses cannot switch models
   while a tool call is pending, which is the whole reason this step type
   exists.
4. **Do NOT write, edit, or create ANY files.**
5. **End your turn.** Do not proceed to the next step in the same turn.
6. Treat the user's next affirmative continuation message as the continuation
   signal. If the message asks to stop, revise the plan, or answer a question,
   handle it without advancing. Once continuation is confirmed, mark this TODO
   `completed` and execute the next step.

### Verify Steps (CHECK)

1. Run the verification commands specified in the step (lint, tests, type checks, syntax checks)
2. If ALL checks pass → mark complete, proceed to the next step
3. If ANY check fails → **STOP immediately**, report the failure to the user, and wait for instructions

## Hard Rule Enforcement

During execution, enforce these constraints:

1. **Explore → Propose before Implement**: If the current step is Implement and the most recent Explore/Propose/Implement step was Explore, STOP — this violates the hard rule. A Propose MUST occur after the last Explore and before Implement. Review and Pause steps may intervene, but they do not substitute for that Propose.
2. **Verify after Implement**: If the current step is Explore, Propose, or Review, and there are preceding Implement steps without a Verify between them, STOP — the plan is malformed.
3. **No leading Pause**: If the plan's first step is a `Pause`, the plan is malformed — notify the user and do not proceed. The opening block is not a boundary; the user already chose a model before starting the run.
4. **Model-switch boundary (pause-enabled plans only)**: Determine the plan's mode once, up front, from its persisted step headings. If the plan contains **zero Pause steps**, it is pause-free — skip this rule entirely and run straight through. If the plan contains **one or more Pause steps**, it is pause-enabled: every transition from an exploration block (Explore/Propose) to an implementation block (Implement/Verify), or back, MUST have a Pause step at the boundary. The plan's opening block is exempt — it has no preceding block to transition from. Review and Pause steps are phase-neutral and never start or end a block. If a pause-enabled plan is missing a boundary Pause, the plan is malformed — notify the user and do not proceed.

If a hard rule violation is detected, notify the user and do not proceed.

## Execution Order

Steps MUST be executed in the order they appear in the plan. Every plan starts
with real work, and a pause-enabled plan places a Pause at each
exploration⇄implementation boundary after that opening block:

```
Explore → Propose → Pause → Implement → Verify → Pause → Explore → ...
   ↑         ↓
   └─ Review ┘
```

Each Pause marks a model switch: once a block has run, the user may swap models
before the next block of the opposite phase.
A plan may run through several such cycles. A pause-free plan omits the Pause
steps and runs the same Explore → Propose → Implement → Verify flow straight
through under a single model. The exact sequence depends on the plan — follow
document order.

## General Rules

- Mark each TODO as `in_progress` when you start it, `completed` when done
- Only have ONE TODO `in_progress` at a time
- If you encounter something unexpected or ambiguous, STOP and ask the user
- Do not go beyond what the plan specifies — if something seems missing, ask the user
