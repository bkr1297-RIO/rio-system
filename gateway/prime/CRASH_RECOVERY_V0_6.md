# Prime Workspace Crash Recovery v0.6

The canonical workspace state file is the only committed state.

## Commit point

A transaction becomes committed only when its fully written and synchronized temporary state file is atomically renamed over `prime-workspace-state.json`.

Therefore:

- a process death before rename does not create a committed mutation;
- an orphan temporary file is discarded during recovery;
- recovery never promotes a temporary file based on apparent completeness;
- no receipt or rollback capability is inferred for an interrupted transaction.

## Lock recovery

The workspace lock records the owning process ID and acquisition time.

A lock may be reclaimed when:

- its recorded process no longer exists on the host; or
- its metadata is unreadable and the lock exceeds the configured stale-lock threshold.

A lock owned by a live process is never reclaimed merely because time has passed.

## Recovery sequence

On workspace initialization:

1. acquire or lawfully reclaim the exclusive lock;
2. discard orphan transaction temporary files;
3. create an empty canonical state only when no canonical state exists;
4. validate the canonical state structure;
5. release the lock.

Malformed canonical state still fails closed. Recovery does not guess, merge, or reconstruct state from temporary files.

## Boundary

This is single-host crash recovery for an isolated filesystem workspace. It does not claim durability against storage-device failure, distributed consensus, or network-filesystem semantics.
