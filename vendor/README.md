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
