# Validation status / 검증 현황

Do not infer live support from successful bundle generation or automated tests. A capability is supported only within the observed client and conditions.

| Layer | Status | Evidence |
| --- | --- | --- |
| Bundle generation / environment separation | Passed locally | Deterministic generation; metadata, links, inventory and checksums |
| Installer | Passed locally | 18 Node test scenarios, including simultaneous profiles, dry-run, byte-verified replacement backup and rollback |
| Skill format | Passed locally | Both bundles passed the skill-creator validator in an isolated validation environment |
| Codex subagent primitive | Observed before this revision | Creation, result collection and follow-up remembering a token; not validation of this skill |
| Codex discussion-only behavior | Passed in a dedicated local app chat | Only file reads; no worker creation or fixture writes |
| Codex hybrid execution and follow-up | Passed in a dedicated local app chat | Independent chat created/read/waited/steered; one read-only child, same-child follow-up, changed-input artifact hashes checked |
| Codex review/ownership/budget scenarios | Passed as decision scenarios | Missing output not accepted; dependent task held; overlapping writes and extra worker disallowed; not a concurrent-write stress test |
| ZCode skill behavior and subagent lifecycle | Observed in a user-run ZCode session on darwin/arm64 | User reported Agent ×2, SendMessage background resume of the same completed agent, and TaskOutput completion; input/result files also checked directly |
| Restart durability and scheduled execution | Not established | Never inferred from same-parent follow-up |
| CI platform matrix | Configured, not yet observed | Node 22/24 on Linux/macOS |

The old project's scenario tests and historical host claims do not establish this revision's support. Personal transcripts, session IDs, local paths and raw execution logs are not published as evidence. Public reports keep the scenario, conditions, outcome and limitations.

## Observations on 2026-10-03

Codex: the discussion-only turn performed reads without spawning a worker or changing the fixture. An explicitly approved independent worker chat then spawned one read-only child, checked its response against the input, and wrote a reviewed result. A later request to the same chat recalled an earlier nonce, resumed the same child, and processed changed input. The input hashes and both result files were independently checked. Model overrides, restart recovery and automation were not exercised.

A final decision-only turn read scenario inputs and checked that a claimed output was actually missing. It did not accept the completed/idle claim, start the dependent task, allow writes that overlap the current owner's file, or add a worker beyond the hypothetical limit. The missing file observation was real; ownership and active-worker states in these cases were simulated, and no remediation or concurrency stress run was performed.

ZCode: the user reported no worker creation before execution approval. Two read-only Explore workers returned the fixture text and a sum of 42; the main wrote a result matching the directly inspected fixture and result files. The same completed token worker was resumed with SendMessage, and TaskOutput reported completion with no file reread. That worker returned the entire fixture line when only the token was requested: lifecycle follow-up succeeded, but exact token-only response formatting did not. A hypothetical missing-evidence result was not approved and dependent work was held; actual remediation/re-review was not exercised. The client version was not established. Scheduling was excluded by the test scope, rather than globally forbidden by the skill.
