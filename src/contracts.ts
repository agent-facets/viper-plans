import { type } from 'arktype'

/**
 * The name grammar shared by plans and artifacts, inherited verbatim from the
 * OpenCode-native VIPER tools this server replaces. It is what makes a name
 * safe to join onto a path: `.`, `..`, `/`, and `\` cannot appear in it.
 */
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/** Artifact used when a caller does not name one. */
export const DEFAULT_ARTIFACT = 'plan'

/** Extension every artifact carries on disk. */
export const ARTIFACT_EXTENSION = '.md'

/** Workspace-relative directory that holds every plan. */
export const PLANS_DIRECTORY = ['.opencode', 'plans'] as const

export const TOOL_NAMES = {
  write: 'viper-write-plan',
  read: 'viper-read-plan',
  edit: 'viper-edit-plan',
  list: 'viper-list-plans',
  delete: 'viper-delete-plan',
} as const

export function isValidName(value: string): boolean {
  return NAME_PATTERN.test(value)
}

/**
 * Resolve the artifact a caller asked for: the default when absent, with one
 * trailing `.md` removed so `plan` and `plan.md` address the same file. Read,
 * write, and edit all normalize through here, which the native tools did not —
 * their read path rejected `plan.md` that their write path accepted.
 */
export function normalizeArtifact(artifact: string | undefined): string {
  const requested = artifact ?? DEFAULT_ARTIFACT
  return requested.endsWith(ARTIFACT_EXTENSION) ? requested.slice(0, -ARTIFACT_EXTENSION.length) : requested
}

// ---------------------------------------------------------------------------
// Failure variants
// ---------------------------------------------------------------------------

const InvalidName = type({
  success: 'false',
  reason: "'invalid_name'",
  name: 'string',
  message: 'string',
})

const InvalidArtifact = type({
  success: 'false',
  reason: "'invalid_artifact'",
  artifact: 'string',
  message: 'string',
})

const EmptyContent = type({
  success: 'false',
  reason: "'empty_content'",
  message: 'string',
})

const NotFound = type({
  success: 'false',
  reason: "'not_found'",
  plan: 'string',
  artifact: 'string',
  message: 'string',
})

const PlanNotFound = type({
  success: 'false',
  reason: "'plan_not_found'",
  plan: 'string',
  message: 'string',
})

const UnsafePath = type({
  success: 'false',
  reason: "'unsafe_path'",
  path: 'string',
  message: 'string',
})

const MustReadFirst = type({
  success: 'false',
  reason: "'must_read_first'",
  plan: 'string',
  artifact: 'string',
  message: 'string',
})

const StaleRead = type({
  success: 'false',
  reason: "'stale_read'",
  plan: 'string',
  artifact: 'string',
  message: 'string',
})

const NoChange = type({
  success: 'false',
  reason: "'no_change'",
  plan: 'string',
  artifact: 'string',
  message: 'string',
})

const OldStringNotFound = type({
  success: 'false',
  reason: "'old_string_not_found'",
  plan: 'string',
  artifact: 'string',
  message: 'string',
})

const AmbiguousMatch = type({
  success: 'false',
  reason: "'ambiguous_match'",
  plan: 'string',
  artifact: 'string',
  count: 'number.integer >= 2',
  message: 'string',
})

const IoError = type({
  success: 'false',
  reason: "'io_error'",
  operation: 'string',
  message: 'string',
})

// ---------------------------------------------------------------------------
// Tool inputs
// ---------------------------------------------------------------------------

// Names are plain strings here on purpose. Rejecting a malformed name in the
// input schema would surface it as a protocol-level validation error; the
// handlers answer with an `invalid_name` result the model can act on instead.

export const WritePlanInput = type({
  plan: type('string').describe('Plan name (letters, digits, hyphens, and underscores)'),
  'artifact?': type('string').describe('Artifact name; defaults to "plan"'),
  content: type('string').describe('Full markdown content of the artifact'),
})

export const ReadPlanInput = type({
  plan: type('string').describe('Plan name to read'),
  'artifact?': type('string').describe('Artifact name; defaults to "plan"'),
})

export const EditPlanInput = type({
  plan: type('string').describe('Plan name to edit'),
  'artifact?': type('string').describe('Artifact name; defaults to "plan"'),
  oldString: type('string').describe('Exact text to replace; include surrounding context to make it unique'),
  newString: type('string').describe('Replacement text'),
  'replaceAll?': type('boolean').describe('Replace every occurrence instead of requiring a unique match'),
})

export const ListPlansInput = type({})

export const DeletePlanInput = type({
  plan: type('string').describe('Plan name to delete, including all of its artifacts'),
})

// ---------------------------------------------------------------------------
// Tool outputs
// ---------------------------------------------------------------------------

const WriteSuccess = type({
  success: 'true',
  plan: 'string',
  artifact: 'string',
  path: 'string',
})

const ReadSuccess = type({
  success: 'true',
  plan: 'string',
  artifact: 'string',
  path: 'string',
  content: 'string',
})

const EditSuccess = type({
  success: 'true',
  plan: 'string',
  artifact: 'string',
  path: 'string',
  replacements: 'number.integer >= 1',
})

const ListSuccess = type({
  success: 'true',
  plans: type({ name: 'string', artifacts: 'string[]' }).array(),
})

const DeleteSuccess = type({
  success: 'true',
  plan: 'string',
  path: 'string',
})

export const WritePlanOutput = WriteSuccess.or(InvalidName)
  .or(InvalidArtifact)
  .or(EmptyContent)
  .or(UnsafePath)
  .or(IoError)

export const ReadPlanOutput = ReadSuccess.or(InvalidName).or(InvalidArtifact).or(NotFound).or(UnsafePath).or(IoError)

export const EditPlanOutput = EditSuccess.or(InvalidName)
  .or(InvalidArtifact)
  .or(NotFound)
  .or(MustReadFirst)
  .or(StaleRead)
  .or(NoChange)
  .or(OldStringNotFound)
  .or(AmbiguousMatch)
  .or(UnsafePath)
  .or(IoError)

export const ListPlansOutput = ListSuccess.or(IoError)

export const DeletePlanOutput = DeleteSuccess.or(InvalidName).or(PlanNotFound).or(UnsafePath).or(IoError)

export type WritePlanArgs = typeof WritePlanInput.infer
export type ReadPlanArgs = typeof ReadPlanInput.infer
export type EditPlanArgs = typeof EditPlanInput.infer
export type DeletePlanArgs = typeof DeletePlanInput.infer

export type WritePlanResult = typeof WritePlanOutput.infer
export type ReadPlanResult = typeof ReadPlanOutput.infer
export type EditPlanResult = typeof EditPlanOutput.infer
export type ListPlansResult = typeof ListPlansOutput.infer
export type DeletePlanResult = typeof DeletePlanOutput.infer

export type PlanResult = WritePlanResult | ReadPlanResult | EditPlanResult | ListPlansResult | DeletePlanResult
