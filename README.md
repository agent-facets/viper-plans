# VIPER Plans

VIPER planning and execution for AI coding agents, shipped two ways:

- **`viper-plans`** — a [facet](https://agentfacets.io) with the VIPER skills and commands.
- **`@agent-facets/viper-plans-mcp`** — the MCP server that stores the plans those commands write.

## The MCP server

`@agent-facets/viper-plans-mcp` is a stdio MCP server that owns plan storage under
`<workspace>/.opencode/plans/<plan>/<artifact>.md`. It requires **Node 20 or newer** and is launched
on demand with `npx`, so nothing is installed into your project.

```jsonc
{
  "mcp": {
    "viper-plans": {
      "type": "local",
      "command": ["npx", "-y", "@agent-facets/viper-plans-mcp@1.3.0"]
    }
  }
}
```

Installing the `viper-plans` facet writes that configuration for you:

```sh
facet add viper-plans --accept-mcp
```

### Tools

| Tool                | Arguments                                                    | Result                            |
|---------------------|--------------------------------------------------------------|-----------------------------------|
| `viper-write-plan`  | `plan`, `artifact?`, `content`                               | Creates or replaces an artifact   |
| `viper-read-plan`   | `plan`, `artifact?`                                          | Returns the artifact's content    |
| `viper-edit-plan`   | `plan`, `artifact?`, `oldString`, `newString`, `replaceAll?` | Exact-string replacement in place |
| `viper-list-plans`  | —                                                            | Every plan and its artifacts      |
| `viper-delete-plan` | `plan`                                                       | Deletes a plan directory          |

`artifact` defaults to `plan`, and one trailing `.md` is stripped from it. Plan and artifact names
must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`.

Every tool answers with human-readable text and a validated structured result. Failures are ordinary
results carrying `success: false` and a specific `reason`, so a model can read and recover from them.

### Storage and safety

- The workspace root is the server process's working directory, which is the project directory the
  host launched it from. Plans always resolve beneath `<workspace>/.opencode/plans/`.
- Paths are containment-checked after symlink resolution; nothing outside the workspace is read,
  written, or deleted.
- Writes are atomic — a uniquely named sibling temporary file is renamed over the target.
- `viper-edit-plan` refuses to edit an artifact this server has not read or written, and refuses
  again if the content changed since then.

## The facet

The facet ships the `viper-planning` and `viper-execution-rules` skills plus the `viper-plan`,
`viper-run`, and `viper-continue` commands. The commands prefer the MCP tools above and fall back to
ordinary file operations when they are unavailable, so the facet works with or without the server.

## Development

```sh
mise exec -- bun install
mise exec -- bun run format
mise exec -- bun check
```

`facet build --verify` validates the facet itself.

## Releasing

`package.json` holds the one version everything else is checked against — the facet, the version its
server declaration launches, and the README example — by `bun run check:version`.

Publishing a GitHub Release tagged `v<version>` runs `.github/workflows/publish.yml`, which reruns
every check, packs one tarball, prints its contents, and publishes that exact file. npm authenticates
the workflow through OIDC trusted publishing and attaches a provenance attestation, so no npm token
exists anywhere in the repository.

Trusted publishing cannot mint the first version of a package, so `1.3.0` was published by hand from
a verified tarball. The npm trusted publisher is configured for organization `agent-facets`,
repository `viper-plans`, workflow `publish.yml`, allowing `npm publish`; every release after the
bootstrap goes through it.

Publishing the facet is separate: `facet build` then `facet publish`, from a merged commit whose
declared package version is already on npm.

## License

MIT
