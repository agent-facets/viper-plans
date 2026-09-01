# Contributing

This repository holds two things that ship together: the `viper-plans` facet (skills and commands)
and `@agent-facets/viper-plans-mcp`, the stdio MCP server the commands store plans through.

## Prerequisites

Toolchain versions are pinned in `mise.toml` — Bun 1.3.14 and Node 24.14.1:

```sh
mise install
```

`bun check` also runs `facet build --verify`, so the [facet CLI](https://agentfacets.io) must be on
your `PATH`. CI installs it pinned:

```sh
curl -fsSL https://agentfacets.io/install | bash -s -- --version 0.32.0
```

The published package supports Node 20 or newer; the pinned version above is only what this
repository is developed and tested against.

## Working on the code

```sh
mise exec -- bun install          # dependencies
mise exec -- bun run format       # biome, with fixes
mise exec -- bun run build        # compile src/ to build/
mise exec -- bun test             # tests (run build first — they exercise build/index.js)
mise exec -- bun run check:facet  # validate the facet without producing an artifact
mise exec -- bun check            # everything below, in one command
```

`bun check` runs format, types, version consistency, build, tests, and facet verification. The tests
pack the package with `npm pack`, install the tarball into a temporary project, and drive the
installed binary over stdio, so the first run is slow and needs network access.

## Versions

`package.json` holds the single version everything else is checked against. `bun run check:version`
(part of `bun check`) fails if any of these drift out of agreement:

- `facet.json`'s `version`
- the exact package version `facet.json`'s server declaration launches with `npx`
- every `@agent-facets/viper-plans-mcp@<version>` reference in `README.md`

When bumping the version, change all of them together.

## Releasing

Publishing a GitHub Release tagged `v<version>` runs `.github/workflows/publish.yml`. It re-checks
the tag against `package.json`, reruns every check, packs one tarball, prints its contents, and
publishes that exact file. npm authenticates the workflow through OIDC trusted publishing and
attaches a provenance attestation, so no npm token exists anywhere in this repository.

Publishing the facet is a separate step — `facet build` then `facet publish` — done from a merged
commit whose declared package version is already on npm.
