# Prime Persistent Workspace v0.4

The Prime reversible runtime now stores bounded workspace state on disk instead of only in process memory.

## Default location

```text
.rio-prime-workspace/prime-workspace-state.json
```

Override the root with:

```bash
PRIME_WORKSPACE_ROOT=/isolated/path
```

The runtime never accepts a path from the Prime request. Callers provide only a validated logical key and string value.

## Persistence contract

The workspace persists:

- current logical key/value state;
- rollback records;
- rollback-token burn state.

A fresh `PrimeSandbox` instance pointed at the same root can recover a receipted mutation and perform its authorized rollback. Once a rollback token is used, that burn survives restart.

## Write behavior

- the workspace root is created with owner-only directory permissions where supported;
- the state file is written with owner-only file permissions where supported;
- updates use temporary-file replacement followed by atomic rename;
- state shape is versioned and validated on every read;
- malformed state fails closed.

## Preserved runtime contract

```text
Prime IR
→ authenticated live API v1 route
→ explicit action-scoped approval
→ isolated persistent mutation
→ native verified RIO receipt
→ durable single-use rollback token
→ separately authorized rollback
→ restored persistent state
→ second verified receipt
```

## Boundary

This is an isolated local persistence adapter. It is not a general filesystem tool, does not expose arbitrary paths, does not write outside its declared workspace root, and does not yet provide multi-process locking or distributed storage semantics.
