# VIPER Plan Construction

This skill describes how to construct well-formed plans using the VIPER step model. VIPER gives plan authors six step types — **Verify**, **Implement**, **Propose**, **Explore**, **Review**, and **Pause** — that can be composed flexibly to match the shape of each change.

## Step Types

Every plan MUST include a Step Types legend at the top so the executor can reference it. Copy this verbatim:

```
## Step Types

- **Verify** → CHECK. Run automated checks (tests, lint, type checks).
  If all checks pass, proceed. If anything fails, STOP and notify the user.
- **Implement** → WRITE. Make code changes — create, edit, or delete files.
- **Propose** → READ-ONLY + USER GATE. Present intended changes in your message text first,
  then ask for approval using the `question` tool with a short prompt (Approve / Reject / Request changes).
  Never put details in the question — the question is just the gate. Do not write anything.
- **Explore** → READ-ONLY. Read files, search the codebase, investigate broadly.
  No writes allowed. Use this to understand the problem space before acting.
- **Review** → READ-ONLY + USER GATE. Present findings and analysis in your message text first,
  then ask for feedback using the `question` tool with a short prompt.
  Never put details in the question — the question is just the gate.
- **Pause** → PAUSE, NO TOOL. A model-switch pause. Emit this exact line of plain text and nothing else:
  "Switch models if desired, then send any message to continue."
  Then end the turn. Do NOT call the `question` tool, and do NOT tell the user to run a command.
  An affirmative continuation resumes execution; a stop, revise-plan, or
  question message is handled without advancing.
```

## Hard Rules

Plan authors MUST follow these constraints when composing steps:

1. **Explore → Propose before Implement**: A Propose step MUST occur after the last Explore and before any Implement step. Never go directly from Explore to Implement. Review and Pause steps may intervene, but they do not substitute for that Propose.
2. **Verify after Implement**: There MUST be at least one Verify step after any Implement step(s). Multiple Implements can batch before a single Verify, but you cannot end a plan or start a new Explore/Propose cycle without verifying what was implemented.
3. **Implement without Propose is allowed**: Not every Implement needs a preceding Propose. The plan author decides when user approval is needed based on the risk and complexity of the change.

## Model-Switch Boundaries

VIPER plans alternate between two phases: an **exploration** phase (Explore and
Propose steps) and an **implementation** phase (Implement and Verify steps).
Users often want a different model for each phase, so a plan MAY mark each phase
transition with a **Pause** step — a spot where the user can switch models
before continuing. The plan does not care which models are used; it only marks
where a switch is possible.

Pause steps are opt-in, giving a plan one of two modes that the executor
detects from the persisted step headings:

- **Pause-enabled** — the plan contains one or more Pause steps. It MUST then
  place a Pause at every phase boundary (see the placement rules below), and the
  executor enforces that coverage.
- **Pause-free** — the plan contains zero Pause steps. This is a valid mode: the
  executor runs it straight through with no model-switch-boundary enforcement.
  Use it when the whole plan runs under a single model. A single-phase plan is
  always pause-free, because it has no phase boundary to mark.

When composing a plan, default to pause-enabled. `/viper-plan` also offers an
"Approve without pauses" choice that strips every Pause before persisting,
producing a pause-free plan.

In a pause-enabled plan, group steps into contiguous **phase blocks**:

- An **exploration block** is a maximal run of Explore and/or Propose steps.
- An **implementation block** is a maximal run of Implement and/or Verify steps.
- Review and Pause steps are **phase-neutral**: they keep the current phase and
  never start, end, or split a block.

A **boundary** is the seam between two adjacent blocks of different phases.
The start of the plan is NOT a boundary: the user already picked a model before
starting the run, so there is nothing to switch away from.

Placement rules:

1. **Step 1 is never a Pause.** Every plan opens with real work — an Explore,
   Propose, Implement, Review, or Verify step.
2. Insert `### Step <N> - Pause: Switch model for exploration` immediately
   before each exploration block that follows an implementation block.
3. Insert `### Step <N> - Pause: Switch model for implementation` immediately
   before each implementation block that follows an exploration block.
4. Insert **exactly one** Pause per boundary. Never place two Pause steps back
   to back, and never insert one between two same-phase steps (e.g. between two
   consecutive Explore steps, or between an Implement and its following Verify).
5. A plan with only one phase block has no boundary, so it takes no Pause at
   all and is therefore pause-free.

A common shape is: Explore(s) → Propose → Pause(implementation) → Implement(s) →
Verify. If a later Explore/Propose block follows the Verify, it gets its own
Pause(exploration), and so on for each subsequent cycle.

These placement rules apply only to pause-enabled plans. A pause-free plan omits
Pause steps entirely and is not subject to boundary placement.

Pause steps use NO `question` tool (see the legend): they emit the fixed
one-line notice and end the turn. An affirmative continuation resumes
execution; a stop, revise-plan, or question message is handled without
advancing. This is deliberate — some harnesses cannot switch models while a tool
call is pending. This is exactly what distinguishes Pause from Review: Review
gates on the `question` tool, Pause never does.

## Step Naming Convention

Format: `### Step <N> - <Type>: <Description>`

Where `<Type>` is one of: `Explore`, `Propose`, `Implement`, `Review`, `Verify`, `Pause` and `<N>` is the step number.

Steps are executed in the order they appear in the plan.

## One Step = One TODO

**Every `### Step <N> - <Type>: <Description>` heading becomes exactly ONE TODO item during execution.** Sub-content within a step is description for that single TODO — it does NOT create separate TODOs. Every distinct action that should be tracked independently MUST be its own step heading.

## When to Use Each Step Type

| Step          | Use when...                                                                                    |
|---------------|------------------------------------------------------------------------------------------------|
| **Verify**    | You need to run automated checks — tests, lint, type checks, syntax validation                 |
| **Implement** | You're ready to write, edit, or delete files                                                   |
| **Propose**   | The change is non-trivial and the user should approve the approach before you write code       |
| **Explore**   | You need to read code, search for patterns, understand architecture before deciding what to do |
| **Review**    | You want to analyze work that was done (yours or existing), present findings, and get feedback |
| **Pause**     | A block already ran and the plan now crosses an exploration⇄implementation boundary, so the user may switch models before the next block (never as Step 1) |

## Example Patterns

### Pattern 1: Full cycle with user gate

A non-trivial change where the user should approve before implementation. The
plan opens with work, and a single Pause marks the exploration→implementation
boundary:

```
### Step 1 - Explore: Understand the widget registry
### Step 2 - Propose: Add FooWidget to the registry
### Step 3 - Pause: Switch model for implementation
### Step 4 - Implement: Add FooWidget to the registry
### Step 5 - Verify: Lint and test the widget registry
```

### Pattern 2: Batched implements with single verify

Multiple related mechanical changes that don't need individual approval. The
batch of Implements is one implementation block, so it takes a single
Pause(implementation):

```
### Step 1 - Explore: Find all deprecated API calls
### Step 2 - Propose: Replace deprecated API calls across 4 files
### Step 3 - Pause: Switch model for implementation
### Step 4 - Implement: Update api_client.rb
### Step 5 - Implement: Update webhook_handler.rb
### Step 6 - Implement: Update batch_processor.rb
### Step 7 - Implement: Update event_listener.rb
### Step 8 - Verify: Run full test suite for API layer
```

### Pattern 3: Research-heavy with review

Deep investigation before a targeted change. The whole opening run of Explores
is one exploration block, and an ordinary Review is phase-neutral so it stays
inside that block:

```
### Step 1 - Explore: Map the authentication flow
### Step 2 - Explore: Identify all session timeout paths
### Step 3 - Review: Present findings on session handling gaps
### Step 4 - Propose: Fix session timeout in OAuth callback
### Step 5 - Pause: Switch model for implementation
### Step 6 - Implement: Fix session timeout in OAuth callback
### Step 7 - Verify: Run auth test suite
```

### Pattern 4: Implement without propose

A trivial/mechanical change where user approval isn't needed. It is a single
implementation block with no boundary, so it is pause-free:

```
### Step 1 - Implement: Fix typo in error message
### Step 2 - Verify: Run lint check
```

### Pattern 5: Multiple exploration/implementation cycles

When a plan implements, verifies, then explores again, each phase transition
after the opening block gets its own Pause:

```
### Step 1 - Explore: Understand the current parser
### Step 2 - Propose: Rewrite the tokenizer
### Step 3 - Pause: Switch model for implementation
### Step 4 - Implement: Rewrite the tokenizer
### Step 5 - Verify: Run tokenizer tests
### Step 6 - Pause: Switch model for exploration
### Step 7 - Explore: Assess downstream AST consumers
### Step 8 - Propose: Update the AST builder
### Step 9 - Pause: Switch model for implementation
### Step 10 - Implement: Update the AST builder
### Step 11 - Verify: Run full parser suite
```

## TODO Naming Convention

Each step's TODO content MUST match the step heading: `<Type>: <Description>`

NEVER combine multiple steps into one TODO.

## Common Mistakes

- **Explore directly to Implement**: Going from Explore to Implement without a Propose in between. A Propose MUST occur after the last Explore before Implement; Review and Pause steps do not substitute for it.
- **Missing Verify after Implement**: Every Implement (or batch of Implements) MUST be followed by a Verify.
- **Bundled phases**: Writing multiple step types as sub-content within a single step heading. Each phase MUST be its own step.
- **Missing type prefix**: Writing "### Add FooWidget" without the Explore/Propose/Implement/Review/Verify/Pause type.
- **Missing legend**: The Step Types legend MUST be included in the plan itself.
- **Leading Pause**: Making Step 1 a `Pause`. The plan's opening block is not a boundary — the user chose a model before starting the run, so a leading Pause just stalls the plan before any work happens.
- **Missing model-switch boundary (pause-enabled plans)**: In a plan that uses Pause steps, transitioning from an exploration block to an implementation block (or back) without a `Pause` step between them. (The opening block has no boundary, and a pause-free plan with no Pause steps is exempt.)
- **Redundant Pause steps**: Placing a Pause between two same-phase steps (e.g. between two Explores, or between an Implement and its Verify), or stacking two Pause steps back to back.
- **Confusing Pause with Review**: Making a model-switch step a Review (which calls the `question` tool) instead of a Pause. Pause emits the fixed one-line notice and never calls a tool; an affirmative continuation resumes it, while a stop, revise-plan, or question message is handled without advancing.
- **Embellishing the Pause line**: Adding phase commentary, next-step detail, or an instruction to run `/viper-run`, `/viper-continue`, or any other command. The Pause output is exactly one fixed sentence.
