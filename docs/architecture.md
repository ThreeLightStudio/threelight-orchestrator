# Architecture / 구조

ThreeLight Orchestrator packages instructions, not an agent runtime. There is no daemon, scheduling service, model API client, database, or automatic environment detection.

## Source and bundles

`src/entry.md` contains the shared entrypoint. `src/profiles.json` selects each host's name, description, execution summary, and reference files. Common operating and record policies live in `src/common/`; execution procedures in `src/modes/`; host-specific behavior in `src/hosts/`.

Generation produces one self-contained directory per host under `skills/`. Each directory contains `SKILL.md`, only the required references, a deterministic checksum manifest, and Codex UI metadata where applicable. No generated bundle reads the original developer's personal skill directory. Editing generated files does not update the source.

The two profile names avoid replacement collisions in a shared skills root. Host-specific descriptions and execution preflight prevent treating the other environment's instructions as a supported tool interface. Both profiles may still be visible to clients that scan the same root.

## Execution responsibility

The main agent owns requirements, dependencies, global concurrency, input acceptance, and final integration review. A worker owns a bounded deliverable and its verification. Completion starts review; it does not approve a task. Task identity survives retries and worker replacement.

In Codex, durable/user-addressable tasks use independent chats where available; a worker chat may delegate bounded assistance within reserved slots. The parent keeps completion responsibility. Assistants cannot create descendants. ZCode v1 uses direct main-to-worker subagents. File ownership and the global worker budget apply across all active contexts.

Run records remain separate from transcripts and install metadata. They can help a new worker continue, but do not make an old agent restartable. Persistence, discovery, messaging, model overrides and automation always depend on the current host tools and permissions.

## Installation

Generation and validation precede installation. A dry-run only reads and reports. Real installation stages and validates the complete bundle next to the destination, protects concurrent operations with a lock, verifies a full backup before replacement, and restores the old directory if committing the stage fails. Abrupt process termination requires inspecting the lock/rollback paths; it is not claimed as automatic crash recovery.

The legacy project and original personal skill were preserved outside this public repository. Their experimental broker/artifact design is not a runtime dependency. This revision derives its operating policies from the former `session-orchestrator`, with explicit host separation and bounded subagent support.
