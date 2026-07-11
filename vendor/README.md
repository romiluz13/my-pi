# Vendor shims

These are minimal compatibility shims, not forks.

## `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui`

`pi-intercom` and `pi-rewind` were published against the old `@mariozechner`
namespace before Pi moved to `@earendil-works`. The packages are otherwise
functional, but their imports fail because `~/.pi/agent/npm/node_modules/@mariozechner/`
is empty.

Each shim simply re-exports the current `@earendil-works/*` package under the
legacy name. `scripts/install.sh` symlinks them into the live npm tree so the
installed packages resolve their imports.

If upstream ever releases namespace-migrated versions, remove these shims and
the install step.

## Runtime resolution

The shims re-export `@earendil-works/*` packages. These are NOT installed in
the local npm tree (`~/.pi/agent/npm/node_modules/@earendil-works/` only
contains `pi-tui`, not `pi-coding-agent`). Instead, `pi-coding-agent` resolves
at runtime via Pi's bundled-core module root — the documented
`peerDependencies: "*"` pattern from Pi's package docs. The shim's
`export * from "@earendil-works/pi-coding-agent"` works because Pi's extension
loader provides the module resolution context. This is loader-dependent, not
npm-resolved — if Pi changes its loader, the shims may need adjustment.

`scripts/update.sh` re-links the shims after every `pi update --all` to handle
cases where an update clears `node_modules/@mariozechner/`.
