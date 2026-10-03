# ThreeLight Orchestrator

Environment-specific skills for coordinating AI coding work: break down tasks, manage dependencies and ownership, review evidence, and resume from records.

The installer does not run agents. Your coding environment executes the installed instructions using its available tools.

| Target | Installed skill | Execution |
| --- | --- | --- |
| Codex | `threelight-orchestrator-codex` | Independent chats for durable work; subagents for bounded assistance or small tasks |
| ZCode | `threelight-orchestrator-zcode` | Subagent workers coordinated by the main agent |

Both skills may appear in clients that share the same skills directory. Choose the skill for your current environment. Each skill checks its environment before execution, and contains only its own host instructions.

## Install

Requires **Node.js 22+**. There are no external dependencies and no npm package to install.

```sh
git clone https://github.com/ThreeLightStudio/threelight-orchestrator.git
cd threelight-orchestrator
node bin/tlo.mjs install --target codex
# Or:
node bin/tlo.mjs install --target zcode
```

The default skills root is `~/.agents/skills`. Install both targets if you use both environments. A custom root must be a directory that your client actually reads:

```sh
node bin/tlo.mjs install --target codex --dest /path/to/skills --dry-run
node bin/tlo.mjs install --target codex --dest /path/to/skills
```

You can also copy one complete folder from `skills/` into your client's skills directory. Preserve its `references/` and optional `agents/` files. Check whether the destination exists before copying. If the skill does not appear, reload the skill list or start a new chat/restart the client as required by your environment.

## Use

Invoke `$threelight-orchestrator-codex` in Codex or `$threelight-orchestrator-zcode` in a ZCode client that supports this invocation syntax. Otherwise attach or ask the agent to read the corresponding `SKILL.md`.

Discussion and planning do not create workers. Explicitly request execution when ready. For example:

> Use the orchestration skill to discuss the scope first. Once we agree, execute independent implementation tasks with clear file ownership, review the results, and integrate only validated inputs.

Codex preserves the original Sol/Luna preference where model selection is supported and authorized. ZCode inherits the current model. Live tool schemas and user choices take precedence. Subagent follow-up within a parent chat does not establish restart durability.

## Update and restore

```sh
git pull --ff-only
node bin/tlo.mjs install --target codex --replace
```

Without `--replace`, an existing directory is left untouched. Replacement backs up its complete previous contents, including local edits, then installs the new bundle. The command prints the backup location. Backups default to `~/.local/share/threelight-orchestrator/backups`, outside skill discovery. Set `THREELIGHT_ORCHESTRATOR_DATA_DIR` to choose a different data root.

To restore, move the current installation outside the skill directory, then copy the reported backup directory back under its original skill name. Reload the client. Do not restore both old and new versions under the same name in different discovery roots. Existing run records and automations are not migrated by this CLI.

Staging and replacement use a per-destination lock and restore the prior directory on ordinary commit failure. After an abrupt process termination, inspect any reported/remaining `.<skill>-rollback-*`, `.<skill>-stage-*`, backup, and lock paths before another install. Restore the rollback directory if the installation is missing, and remove a stale lock only after confirming no installer is running. Cross-process crash recovery is manual.

## Develop

Edit `src/`, not the generated `skills/` folders.

```sh
node bin/tlo.mjs build --target codex --out skills
node bin/tlo.mjs build --target zcode --out skills
node bin/tlo.mjs check
npm test
```

`build` regenerates one target under the output root. Existing build outputs must be intact recognized bundles; move locally edited outputs aside before rebuilding. `check` verifies metadata, links, checksums, and exact agreement with the source. CI checks Node.js 22 and 24 on Linux and macOS; the workflow configuration alone does not mean those runs have passed.

See [architecture](docs/architecture.md), [validation status](docs/validation.md), [Codex scenarios](docs/codex-validation.md), and [ZCode live validation](docs/zcode-validation.md).

## 한국어 안내

작업 분해·의존성·파일 소유권·검토·기록을 관리하는 환경별 스킬입니다. CLI는 설치만 담당하며 실제 작업자는 각 환경의 에이전트가 실행합니다.

```sh
git clone https://github.com/ThreeLightStudio/threelight-orchestrator.git
cd threelight-orchestrator
node bin/tlo.mjs install --target codex
node bin/tlo.mjs install --target zcode
```

- Node.js 22 이상이 필요하며 `npm install`은 필요하지 않습니다.
- 기본 위치는 `~/.agents/skills`입니다. 두 환경을 함께 쓰면 두 설치본을 설치할 수 있습니다. 공유 폴더를 읽는 앱에서는 두 스킬이 보일 수 있으므로 현재 환경의 이름을 선택하세요.
- Codex는 `$threelight-orchestrator-codex`, ZCode는 지원되는 호출 방식으로 `threelight-orchestrator-zcode`를 선택합니다. 호출 문법이 없으면 해당 `SKILL.md`를 읽도록 요청하세요.
- 논의만 할 때는 작업자를 만들지 않습니다. 독립 작업 대화를 유지하려면 Codex 별도 세션, 작은 작업과 보조 조사·검토에는 서브에이전트를 사용합니다.
- 변경 예정 내용은 `--dry-run`, 기존 설치본 교체는 `--replace`로 확인합니다. 교체 전에 전체 백업을 만들고 그 위치를 출력합니다.
- 기존 `session-orchestrator`에서 전환할 때는 설치본을 검색 경로 밖에 보존하고 새 Codex용 설치본을 검증한 뒤 기존 설치본을 검색 경로에서 제거하세요. 과거 실행 기록과 자동화는 그대로 둡니다.
- 원본은 `src/`, 생성된 배포본은 `skills/`입니다. 실제 환경별 지원 범위는 [검증 현황](docs/validation.md)을 확인하세요.

## License

[MIT](LICENSE), © 2026 ThreeLightStudio.
