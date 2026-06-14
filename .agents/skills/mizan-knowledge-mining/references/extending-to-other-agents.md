# Extending the pipeline to another coding agent

The pipeline is agent-agnostic by design. Only **one thing** is agent-specific: turning that
agent's on-disk session files into **signal rows** (`list[(role, text)]`). Everything after
that — profile, dedupe, bin-pack, distill, reduce, reconcile — is unchanged. So adding Cursor /
Aider / Codex / Cline / Continue / your-own-agent is: *find the store, write/choose a parser,
register it in `discover()`, test with `--list`.* Nothing in steps 2–5 of the pipeline changes.

## Mental model
A **store** = `(discovery glob [+ project filter])  ×  parser(path) -> (header, signal_rows)`.
- `header = {"id", "title", "timestamp", "store"}` — `id` must be unique per session (it's the
  dedupe key); `store` is a short tag used for bin-pack grouping and labelling.
- `signal_rows` = `[(role, text), …]` of **USER + ASSISTANT text only**. Drop system/tool/
  thinking/tool-result. (Why: see `transcript-formats.md` — tool I/O is >90% of bytes, ~0% of
  durable knowledge.)

## Checklist to add an agent
1. **Locate the store.** Find where the agent writes sessions on disk (table below, or
   discover it: `find ~ -newermt '-2 days' -name '*.jsonl' -o -name '*.db'` after a known
   session; inspect `~/.config/<agent>`, `~/.<agent>`, VS Code `globalStorage`).
2. **Inspect the format.** `read <one file>:1-3`. JSON/JSONL of `{role, content}` → the generic
   parser already handles it. Markdown or SQLite → bespoke parser (sketches below).
3. **Choose/write the parser.** Reuse `parse_openai_style` for OpenAI-style JSON/JSONL; else
   add a `parse_<agent>(path) -> (header, rows)` next to the others. Keep it tolerant
   (`try/except` per record; return `(None, [])` on garbage).
4. **Register in `discover()`** — the `# 4. OTHER AGENTS` extension block. Append
   `(parser, path)` for each matched file. **Respect project scoping** (next section).
5. **Test.** `python3 scripts/mine_sessions.py --list` — confirm your store shows a sane
   non-zero count and titles/dates look right. Then run without `--list` and spot-check a
   `batches/batch-NN.txt`. Then distill/reduce as usual.

## The generic parser (`parse_openai_style`) — use it first
Handles the common shape with no new code:
- **JSONL** (one record per line; e.g. Codex `rollout-*.jsonl`) — record is a message, or wraps
  one in `.message`/`.payload`.
- **JSON file** holding a `list`, or a dict with `messages|conversation|history|items` (e.g.
  Cline `api_conversation_history.json`).
- Content as `str`, list of blocks (`{type:input_text|output_text|text, text}` or
  `{content:"…"}`), or a dict. Role aliases `human→user`, `ai|model→assistant`; system/tool
  dropped. `id` is a path-hash (collision-free even when files share a name like
  `api_conversation_history.json` or a `rollout-` prefix). `timestamp` from a per-record
  `timestamp|ts|created_at`, else file mtime.

Wire it (uncomment + adapt in `discover()`):
```python
for p in sorted(glob.glob(os.path.join(HOME, ".codex/sessions/*/*/*/rollout-*.jsonl"))):
    found.append((parse_openai_style, p))
```

## Project scoping — the trap
OMP and Claude Code dir-scope sessions by project (one dir per repo), so the `project`
substring filter works. **Many other agents do not:**
- **Codex CLI** scopes by *date* (`~/.codex/sessions/YYYY/MM/DD/`), not project → globbing pulls
  **every** project's sessions.
- **Aider** writes to **CWD** (`.aider.chat.history.md` in each repo) → already project-local,
  but one rolling file, not per-session.
- **Cline** scopes by *task-id*, not project.
When a store isn't dir-scoped, filter another way: most records carry a `cwd` / `workspace` /
`projectRoot` field — keep only sessions whose path matches your repo; or post-filter by
content (a session that never mentions the project's name/paths is almost certainly noise).
Add the filter inside your `discover()` block; don't mine the whole machine.

## Bespoke parsers (when generic won't do)
- **Markdown (Aider `.aider.chat.history.md`)** — turns are delimited by headers like
  `#### <user message>` and assistant prose between them; one rolling file = one "session"
  (split on a date/separator if you want finer grain). Sketch: read lines, treat `####`-prefixed
  blocks as `user`, the prose until the next `####` as `assistant`; `id` = path-hash, `timestamp`
  = file mtime. Stdlib only.
- **SQLite (Cursor `state.vscdb`)** — chat lives in table `ItemTable`, key
  `composer.composerData` (newer) / `workbench.panel.aichat.view.aichat.chatdata` (legacy), as a
  JSON blob; DBs are under `~/.config/Cursor/User/workspaceStorage/<hash>/` (Linux) keyed by
  workspace. Sketch: `sqlite3.connect(db)` (open read-only: `file:…?mode=ro` URI),
  `SELECT value FROM ItemTable WHERE key=?`, `json.loads`, then walk the bubbles/messages into
  `(role, text)`. Map the workspace-hash dir to your repo first (Cursor stores a
  `workspace.json` with the folder path). `sqlite3` is stdlib.

## Known storage locations (grounded 2026.06 — verify; they drift by version/OS)
| Agent | Linux location | Format | Parser |
|---|---|---|---|
| OMP (oh-my-pi) | `~/.omp/agent/sessions/<slug>/*.jsonl` + repo `.omp/exports/*.html` | JSONL header+entries / base64-HTML | built-in |
| Claude Code | `~/.claude/projects/<slug>/*.jsonl` | line-typed JSONL | built-in |
| OpenAI Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (`$CODEX_HOME` overrides) | JSONL "rollout" | `parse_openai_style` |
| Cline (VS Code ext) | `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/<id>/api_conversation_history.json` | JSON array | `parse_openai_style` |
| Aider | `<repo>/.aider.chat.history.md` (`AIDER_CHAT_HISTORY_FILE` overrides) | Markdown | bespoke |
| Cursor | `~/.config/Cursor/User/workspaceStorage/<hash>/state.vscdb` (`ItemTable`) | SQLite + JSON blob | bespoke |

Sources: Codex `~/.codex/sessions/.../rollout-*.jsonl` (developers.openai.com/codex, openai/codex
disc. #2956); Cline globalStorage tasks (cline/cline issue #7742); Aider `.aider.chat.history.md`
(aider.chat/docs/faq, Aider-AI/aider #2684); Cursor `state.vscdb`/`ItemTable.composer.composerData`
(somogyijanos/cursor-chat-export, cursor forum #77295). macOS/Windows differ — see those sources.

## After extraction: the rest of the pipeline
Once your parser yields signal rows, nothing else changes — but two small touch-ups make the
synthesis aware of the new source:
- **Corpus ordering** (pipeline step 3): place the new agent's era in the chronological
  concat so the timeline reads right (the dev's tool-migration order).
- **Domain-subagent context** (step 3): mention the new store/era in the shared `context` so
  reducers attribute facts to it and detect cross-tool reversals.
- **Register provenance** (step 5): update the "Sources mined" table + the skill's
  `stores.md` if the new store is now a standing part of the project's history.
