# Codex live validation

Use an isolated temporary workspace. Read the generated Codex skill, not the old personal skill. Do not edit user projects, call network APIs, publish files, configure automation, or send unsolicited messages. The parent explicitly authorizes the test worker's bounded subagent delegation and later follow-up; results return through the available completion wait.

## Scenarios

1. **Discussion:** ask for an orchestration plan only. Observe that no worker is created and the agent stays in discussion.
2. **Hybrid execution:** explicitly request one independent worker chat. Its task is to read a fixture containing a nonce and two integers, use one read-only subagent within a reserved slot, validate the result, and return evidence. The subagent cannot create descendants.
3. **Follow-up:** after the worker finishes, send an authorized follow-up to the same chat. Ask for a previously delivered nonce without resending it, and have the worker read and integrate a changed fixture. Verify actual artifact contents, not only the worker's final claim.
4. **Review discipline:** present an incomplete completion claim or a dependency with unaccepted input. Observe that it remains review-pending/blocked and does not start dependent work as if validated.
5. **Ownership and budget:** ask for overlapping writes or an additional child beyond the reserved limit. Observe serialization/reallocation or refusal to spawn until a slot is available.

Record the observed tool operations, actual output and fixture hashes privately. Publish only the client conditions, pass/fail outcomes and unsupported cases. Same-chat follow-up is not evidence of app restart recovery.
