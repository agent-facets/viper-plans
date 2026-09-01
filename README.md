# VIPER Plans

A VIPER plan is a saved sequence of typed steps for an AI coding agent. Each step declares what the
agent is allowed to do at that point: investigate without writing, stop and ask you, write files,
verify its work, or pause so you can switch models.

```md
### Step 1 - Explore: Understand the authentication flow
### Step 2 - Propose: Present the safest session-timeout fix
### Step 3 - Pause: Switch model for implementation
### Step 4 - Implement: Fix session timeout handling
### Step 5 - Verify: Run the authentication tests
```

That plan is not a suggestion the agent may reinterpret. Step 1 cannot edit a file. Step 2 must stop
and wait for your answer. Step 4 may only make the change you approved. Step 5 must run the tests and
stop the run if they fail. Step 3 ends the turn so you can move from a research-strong model to an
implementation-strong one before any code is written.

## What this is for

An agent asked to "add rate limiting" will usually start editing before it understands the codebase,
and will usually report success without running anything. The common workaround — asking it to write
a plan first — produces a checklist with no authority: nothing stops the agent from skipping ahead,
and the plan disappears with the conversation.

VIPER plans are different in two ways:

- **The step type is binding.** `Explore` cannot write. `Implement` cannot run without an approved
  `Propose` after the last `Explore`. An `Implement` block cannot be followed by more exploration
  until a `Verify` has run.
- **The plan is a file.** It lives at `.opencode/plans/<name>/plan.md` in your workspace. You can
  read it, edit it, run it tomorrow, or hand it to a different agent in a fresh session.

## Use it

```sh
facet add viper-plans
```

Then, in your agent:

```text
/viper-plan Add request IDs to API error responses
```

The planning command explores the repository, asks you clarifying questions, and shows you the
finished plan. You approve it — with or without model-switch pauses — and it is written to disk.

```text
/viper-continue
```

Execution begins immediately: one TODO per step, in order, with the gates the plan declares.

## The step types

VIPER names the vocabulary, not the order. Plans run in the order their steps are written, and most
plans use only some of these types.

| Step          | The agent...                                                                    |
|---------------|---------------------------------------------------------------------------------|
| **Explore**   | Reads and searches. Writing anything is forbidden.                              |
| **Propose**   | Presents a concrete approach and stops until you approve, reject, or revise it. |
| **Implement** | Makes the approved change, and nothing beyond it.                               |
| **Verify**    | Runs tests, lint, or type checks. Any failure halts the run.                    |
| **Review**    | Presents findings and stops for your feedback.                                  |
| **Pause**     | Ends the turn at a phase boundary so you can switch models.                     |

Two structural rules hold in every plan:

1. **No `Explore` straight to `Implement`.** A `Propose` must come after the last `Explore` and
   before any writing. Research is never allowed to slide silently into edits.
2. **No `Implement` without a following `Verify`.** A plan cannot end, or turn back to exploration,
   on unverified changes.

## Common shapes

A typo fix does not need research or approval:

```md
### Step 1 - Implement: Fix the typo in the error message
### Step 2 - Verify: Run the lint check
```

A change that needs understanding first:

```md
### Step 1 - Explore: Find every caller of the deprecated client
### Step 2 - Propose: Replace the deprecated calls across four files
### Step 3 - Pause: Switch model for implementation
### Step 4 - Implement: Update the four call sites
### Step 5 - Verify: Run the API test suite
```

Research where you want to weigh in before a direction is chosen:

```md
### Step 1 - Explore: Map the session timeout paths
### Step 2 - Review: Present the gaps found in session handling
### Step 3 - Propose: Fix the timeout in the OAuth callback
### Step 4 - Pause: Switch model for implementation
### Step 5 - Implement: Fix the timeout in the OAuth callback
### Step 6 - Verify: Run the auth test suite
```

The same plan without pauses, for a run that stays on one model:

```md
### Step 1 - Explore: Map the session timeout paths
### Step 2 - Propose: Fix the timeout in the OAuth callback
### Step 3 - Implement: Fix the timeout in the OAuth callback
### Step 4 - Verify: Run the auth test suite
```

A plan is **pause-enabled** if it contains any `Pause` step, in which case every
exploration⇄implementation boundary must have one. A plan with no `Pause` steps at all is
**pause-free** and simply runs straight through. Both are valid; `/viper-plan` lets you choose when
you approve.

## A full run

```text
/viper-plan Add rate limiting to login attempts
```

The agent reads your auth code and asks what it cannot infer — the limit, the window, whether
lockout is per-account or per-IP. It then shows you a plan and asks how to save it: keeping the
`Pause` steps, dropping them, or changing something first. On approval it writes
`.opencode/plans/login-rate-limit/plan.md` and stops. Planning never implements.

```text
/viper-continue
```

The run starts. `Explore` reads the login handler and the existing middleware. `Propose` then shows
you the actual approach it found — which middleware to extend, where the counter lives, what happens
on a cold start — and waits.

This second gate is not a repeat of the first. When you approved the plan, you approved *what would
be investigated and in what order*. The `Propose` step asks about *the specific change the
investigation turned up*, which nobody knew at planning time.

You approve. The next step is a `Pause`, so the agent prints one line and ends its turn:

```text
Switch models if desired, then send any message to continue.
```

Switch your model if you want to, then send any message — `continue` is enough. Do not re-run a
command; the run is already in progress and picks up at the next step.

`Implement` writes the change. `Verify` runs the test suite. If anything fails the run stops there
and tells you, rather than pressing on. When the plan finishes, the agent offers to delete it.

## The commands

| Command                | What it does                                                                     |
|------------------------|----------------------------------------------------------------------------------|
| `/viper-plan <goal>`   | Explores, asks, composes, shows you the plan, and saves it once you approve.      |
| `/viper-continue`      | Runs the plan you just created, with no re-confirmation. Takes an optional name.  |
| `/viper-run [name]`    | Lists saved plans, lets you pick and review one, then executes it.                |

Use `/viper-continue` right after planning. Use `/viper-run` for a plan from an earlier session — or
after a compaction, when the agent no longer remembers which plan is current.

## Why the MCP server

The facet works without it: the commands fall back to ordinary file operations. The server is what
makes plan storage dependable rather than improvised.

- **Plans are real workspace state.** They persist across turns, sessions, compactions, and agents,
  and can be listed later instead of remembered.
- **The agent gets plan operations, not path guesswork.** Five explicit tools replace an agent
  assembling `.opencode/plans/...` paths by hand and hoping it got the layout right.
- **Edits cannot clobber what the agent has not seen.** `viper-edit-plan` refuses to touch an
  artifact this server has not read or written, and refuses again if the bytes changed since. A plan
  you edited by hand mid-run stops the agent instead of being silently overwritten.
- **Ambiguity fails loudly.** An `oldString` matching more than once is rejected unless you asked for
  `replaceAll`, so a "fix one step" edit cannot quietly rewrite three.
- **Failures are recoverable.** Every failure comes back as a tool error carrying a structured reason
  — `not_found`, `stale_read`, `ambiguous_match`, `invalid_name` — that an agent can read and act on,
  rather than an opaque protocol fault.
- **Storage is protected.** Writes are atomic, concurrent operations on one artifact are serialized,
  and every path is containment-checked after symlink resolution so nothing outside
  `<workspace>/.opencode/plans/` is read, written, or deleted.

### Tools

| Tool                | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| `viper-write-plan`  | Create or replace a plan artifact                              |
| `viper-read-plan`   | Read an artifact — and license a later edit of it              |
| `viper-edit-plan`   | Exact-string replacement, guarded against stale or ambiguous edits |
| `viper-list-plans`  | Every plan in the workspace and the artifacts it holds         |
| `viper-delete-plan` | Remove a plan directory and everything in it                   |

Artifacts live at `<workspace>/.opencode/plans/<plan>/<artifact>.md`, where `artifact` defaults to
`plan`. Plan and artifact names must match `^[A-Za-z0-9][A-Za-z0-9_-]*$` — the grammar that makes a
name safe to join onto a path.

## Install

From the registry:

```sh
facet add viper-plans
```

From a local checkout:

```sh
facet add ./path/to/viper-plans
```

Because this facet declares an MCP server, `facet` asks you to approve that configuration. In CI or
any run without a terminal, approve it up front with `facet add viper-plans --accept-mcp`.

To configure the server yourself instead, point your client at the published package. It runs on
**Node 20 or newer**, launched on demand by `npx`, so nothing is installed into your project:

```jsonc
{
  "mcp": {
    "viper-plans": {
      "type": "local",
      "command": ["npx", "-y", "@agent-facets/viper-plans-mcp@1.3.1"]
    }
  }
}
```

## Reference

The binding rules the agent follows live in the skills themselves:

- [`skills/viper-planning/SKILL.md`](skills/viper-planning/SKILL.md) — how a well-formed plan is
  composed.
- [`skills/viper-execution-rules/SKILL.md`](skills/viper-execution-rules/SKILL.md) — how each step
  type is executed and how the rules are enforced.

Working on this repository? See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
