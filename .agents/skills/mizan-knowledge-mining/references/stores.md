# Session stores — where transcripts live

These are the stores that exist for Mizan today (OMP + Claude Code). `mine_sessions.py`
discovers all three; verified 2026.06.08, re-check if the harness changes. To mine a
*different* coding agent (Cursor / Aider / Codex / Cline / …), see
`extending-to-other-agents.md` — the model is the same: a store = discovery glob + parser.

| Store | Location | Format | Notes |
|---|---|---|---|
| OMP HTML exports | `<repo>/.omp/exports/*.html` | base64-JSON in HTML | Manually-exported sessions; in-repo (gitignored). 6 exist. |
| OMP native | `~/.omp/agent/sessions/<slug>/*.jsonl` | JSONL (header + entries) | The live OMP store — **every** OMP session, auto-written. |
| Claude Code | `~/.claude/projects/<slug>/*.jsonl` | JSONL (line-typed) | Every Claude Code session for the project. |

A 4th, related store: the **sibling brainstorm repo** at
`~/.claude/projects/<slug-with-brainstorm-suffix>/` — the design-predecessor where the
workflow/role/committee/document model was invented. Include with `--include-brainstorm`.

## Slug encoding (the two schemes differ!)
The project working dir is `/home/<user>/code/work-noeffort/projects/hijra-mizan/mizan`.

- **Claude Code** encodes the **full absolute path** with `/`→`-` and a leading `-`:
  `-home-luthfi-code-work-noeffort-projects-hijra-mizan-mizan`
- **OMP** encodes a **truncated path** (drops the `/home/<user>` prefix):
  `-code-work-noeffort-projects-hijra-mizan-mizan`

Because the schemes differ, the script matches stores by **substring** (`hijra-mizan-mizan`),
not by reconstructing the exact encoding. The sibling brainstorm slug ends in
`hijra-mizan-brainstorm` — the script derives it with `re.sub(r'-mizan$', '-brainstorm', …)`
(plain `.replace('-mizan',…)` would wrongly hit the first `-mizan` in `hijra-mizan`).

## THE gotcha: `~/.omp/agent/sessions`, not `~/.omp/sessions`
The OMP native store is nested under `agent/`:
```
~/.omp/agent/sessions/<slug>/<TIMESTAMP>_<UUID>.jsonl
```
`~/.omp/sessions/` **does not exist** — globbing it returns nothing and looks like "the
sandbox is hiding the store." It is not hidden; the path was just wrong. The eval/bash sandbox
*can* read `~/.omp/agent/sessions/` and `~/.claude/projects/` directly (verified). If a store
returns 0 sessions, it is a **path/slug mismatch**, not a permissions problem — fix the glob.

> Earlier mining mis-diagnosed this as "the store flickers in/out of the sandbox." Wrong: the
> `find` tool and the eval sandbox simply showed `~/.omp/agent/...` with different nesting and
> the path was misread. Correct path always works.

## Subagent dirs
Both OMP and Claude Code may write subagent transcripts in a sibling directory (e.g. one dir
per `task` subagent). The script ignores these — top-level `*.jsonl` per session is enough,
and subagent turns also appear inline in the parent (Claude Code marks them `isSidechain:true`,
kept and labelled "(subagent)"). The current running session's own dir contains *your* live
subagents — exclude the running session via `--current-session <id8>`.

## Identifying a session
- OMP: 8-hex id is the `id` field in the header line (and the `_<uuid>` in the filename).
- Claude Code: the filename stem is the session UUID; the script uses its first 8 chars.
The script **dedupes by 8-char id**, preferring the richer store
(`omp-export` > `omp` > `cc`) when the same id appears twice (e.g. an OMP session that was also
HTML-exported).
