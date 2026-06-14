# Transcript formats — parsing notes

Three on-disk shapes. `mine_sessions.py` has a parser for each; this is the spec so you can
fix/extend them when a format drifts. Goal of every parser: produce **signal rows** =
`list[(role, text)]` of USER + ASSISTANT *text only* — tool calls, tool results, and thinking
are dropped (they are >90% of the bytes and ~0% of the durable knowledge).

## 1. OMP HTML export (`.omp/exports/*.html`)
Self-contained HTML viewer. The data is one base64 blob:
```html
<script id="session-data" type="application/json">BASE64…</script>
```
Decode: `json.loads(base64.b64decode(blob))`. Plain base64 → UTF-8 JSON (no gzip). Shape:
```
{ header: {id, title, timestamp, …}, entries: [...], systemPrompt, tools, leafId }
```
`entries[]` is the conversation (same entry schema as the OMP native store, below).

## 2. OMP native (`~/.omp/agent/sessions/<slug>/*.jsonl`)
Line-delimited JSON. **First line** is the session header `{"type":"session", id, title,
timestamp, …}`. **Every other line** is an entry with the same schema as the export's
`entries[]`:
- `type:"message"` → `message.role` ∈ {`user`,`assistant`,`toolResult`,…} and
  `message.content` = list of blocks. Block types seen: `text`, `toolCall`, `thinking`,
  `image`. Keep only `type:"text"` blocks (`.text`).
- `type:"custom_message"` → `customType` + `content` (string). These are harness injections.
  Keep `goal-mode-context` / `goal-continuation` (carry user goals); drop `skill-prompt`,
  `resolve-reminder`, `todo-error-reminder` (boilerplate).
Drop `message.role == "toolResult"` entirely (tool output text).

## 3. Claude Code (`~/.claude/projects/<slug>/*.jsonl`)
Line-delimited JSON, one record per line, **line-typed** by `type`:
- `user` / `assistant` → `message.content` is a string OR a list of blocks
  (`text`/`thinking`/`tool_use`/`tool_result`). Keep only text. `isSidechain:true` marks a
  subagent turn (kept, labelled "(subagent)").
- `summary` → `.summary` (a title-ish recap). `custom-title` → `.title`. `ai-title` → `.title`.
  Use these for the session title (prefer custom > ai > summary > `slug`).
- Other types (`system`, `file-history-snapshot`, `mode`, …) → ignored.
Useful side fields on most records: `timestamp`, `gitBranch`, `slug`, `cwd`, `sessionId`,
`uuid`/`parentUuid`. The script reads `timestamp` (first/last → date range) and titles.

## Signal vs noise (what to keep)
KEEP: user message text, assistant message text (incl. subagent text). These hold directives,
decisions, conclusions, rationale, reversals.
DROP: `tool_use`/`toolCall`, `tool_result`/`toolResult`, `thinking`/`thinking` blocks,
images, and harness boilerplate custom messages. Tool I/O occasionally contains a pasted file,
but the assistant's *conclusion about it* is in the text — that's what you want, at ~1/20th
the size.

## Why signal-only matters
Full Mizan history is hundreds of MB. Signal-only is ~6.7M chars (~1.7M tokens) — still too
big for one context, but now tractable via bin-packed batches. Never widen the parsers to keep
tool output "just in case"; it defeats the entire pipeline.

## Format drift
If a parser suddenly yields 0 rows for a known-rich session, the format changed. Inspect one
file's first 2–3 lines (`read <file>:1-3`) and adjust block/field names. The three parsers are
small and independent (`parse_omp_html`, `parse_omp_native`, `parse_claude_code`).
