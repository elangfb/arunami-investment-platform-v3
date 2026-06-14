#!/usr/bin/env python3
"""
mine_sessions.py — discover, profile, and extract signal-only transcripts from
every agent session (OMP / oh-my-pi + Claude Code) that touched this project.

This is the DETERMINISTIC half of the knowledge-mining pipeline (see
../references/pipeline.md). It does NOT call any model. It:

  1. discovers the three session stores for a project,
  2. parses each session (3 formats) into signal-only rows
     (USER + ASSISTANT text; tool I/O and thinking dropped),
  3. profiles each session (title, date range, turn counts, signal size),
  4. filters out trivial/ops sessions below a size threshold,
  5. bin-packs the substantive sessions into subagent-sized batch files
     plus a manifest.json describing each batch.

The LLM half (distill each batch -> digest; reduce digests -> domain syntheses;
reconcile -> KNOWLEDGE-MAP) is agent-driven and documented in pipeline.md.

Stdlib only. Python 3.9+.

Usage:
  python mine_sessions.py --list                  # profile only, write nothing
  python mine_sessions.py                          # write batches + manifest
  python mine_sessions.py --include-brainstorm     # also mine the sibling repo
  python mine_sessions.py --project hijra-mizan-mizan --out .omp/exports/_extracted

Key gotcha baked in: the OMP native store lives at
  ~/.omp/agent/sessions/<slug>/      (NOT ~/.omp/sessions/ — that path does not exist)
and OMP encodes the slug differently from Claude Code (see ../references/stores.md).
Both stores are readable from the eval/bash sandbox at these paths.
"""
from __future__ import annotations

import argparse
import base64
import glob
import hashlib
import json
import os
import re
import sys
from collections import Counter

HOME = os.path.expanduser("~")

# ---- format parsers --------------------------------------------------------
# All three parsers return (header, signal_rows) where:
#   header     = {"id", "title", "timestamp", "store"}
#   signal_rows= list[(role, text)]   role in {user, assistant, user~sub, assistant~sub,
#                                              custom:<type>, ...}; text is non-empty.

# Roles/blocks that are pure noise for knowledge mining.
_OMP_DROP_ROLES = {"toolResult"}
_OMP_DROP_CUSTOM = {
    "custom:skill-prompt",
    "custom:resolve-reminder",
    "custom:todo-error-reminder",
}


def _omp_text(content):
    """Extract concatenated text blocks from an OMP message content."""
    if isinstance(content, str):
        return content
    out = []
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                out.append(b.get("text", ""))
    return "\n".join(out)


def _omp_entries_to_rows(entries):
    rows = []
    for e in entries:
        t = e.get("type")
        if t == "message":
            role = (e.get("message") or {}).get("role")
            if role in _OMP_DROP_ROLES:
                continue
            txt = _omp_text((e.get("message") or {}).get("content"))
            if txt.strip():
                rows.append((role, txt))
        elif t == "custom_message":
            key = "custom:" + e.get("customType", "custom")
            if key in _OMP_DROP_CUSTOM:
                continue
            txt = e.get("content", "")
            if txt.strip():
                rows.append((key, txt))
    return rows


def parse_omp_html(path):
    """OMP HTML export: base64 JSON in <script id="session-data">."""
    with open(path, "r", encoding="utf-8") as fh:
        html = fh.read()
    m = re.search(
        r'<script id="session-data" type="application/json">(.*?)</script>', html, re.S
    )
    if not m:
        return None, []
    data = json.loads(base64.b64decode(m.group(1).strip()).decode("utf-8"))
    h = data.get("header", {})
    header = {
        "id": (h.get("id") or os.path.basename(path))[:8],
        "title": h.get("title") or "(untitled)",
        "timestamp": h.get("timestamp") or "",
        "store": "omp-export",
    }
    return header, _omp_entries_to_rows(data.get("entries", []))


def parse_omp_native(path):
    """OMP native JSONL: first line {type:session} header, rest are entries."""
    header_obj = None
    entries = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            if o.get("type") == "session" and header_obj is None:
                header_obj = o
            else:
                entries.append(o)
    if not header_obj:
        return None, []
    header = {
        "id": (header_obj.get("id") or os.path.basename(path))[:8],
        "title": header_obj.get("title") or "(untitled)",
        "timestamp": header_obj.get("timestamp") or "",
        "store": "omp",
    }
    return header, _omp_entries_to_rows(entries)


def _cc_text(content):
    if isinstance(content, str):
        return content
    out = []
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                out.append(b.get("text") or "")
    return "\n".join(out)


def parse_claude_code(path):
    """Claude Code JSONL: line-typed records (user/assistant/summary/title/...)."""
    title = ai_title = slug = None
    t_first = t_last = None
    rows = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            ty = o.get("type")
            if ty == "custom-title":
                title = o.get("title") or title
            elif ty == "ai-title":
                ai_title = o.get("title") or ai_title
            elif ty == "summary":
                ai_title = ai_title or o.get("summary")
            if o.get("slug"):
                slug = o["slug"]
            ts = o.get("timestamp")
            if ts:
                t_first = t_first or ts
                t_last = ts
            if ty in ("user", "assistant"):
                txt = _cc_text((o.get("message") or {}).get("content"))
                if not txt.strip():
                    continue
                role = ty + ("~sub" if o.get("isSidechain") else "")
                rows.append((role, txt))
    header = {
        "id": os.path.basename(path)[:8],
        "title": title or ai_title or slug or "(untitled)",
        "timestamp": t_first or "",
        "store": "cc",
    }
    return header, rows

# Role aliases other agents use for the two roles we keep.
_OAI_USER = {"user", "human"}
_OAI_ASSISTANT = {"assistant", "ai", "model"}


def _oai_text(content):
    """Text from an OpenAI/generic message content (str | list-of-blocks | dict)."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        return content.get("text") or content.get("content") or ""
    out = []
    if isinstance(content, list):
        for b in content:
            if isinstance(b, str):
                out.append(b)
            elif isinstance(b, dict):
                # OpenAI block types input_text/output_text/text all carry .text;
                # some agents nest plain {content: "..."}.
                t = b.get("text") or (b.get("content") if isinstance(b.get("content"), str) else "")
                if t:
                    out.append(t)
    return "\n".join(out)


def _oai_message(obj):
    """Pull a {role, content} message out of a record, unwrapping common nesting."""
    if not isinstance(obj, dict):
        return None
    for m in (obj, obj.get("message"), obj.get("payload")):
        if isinstance(m, dict) and "role" in m and "content" in m:
            return m
    return None


def parse_openai_style(path):
    """Generic parser for agents that store OpenAI-style messages — either JSONL
    (one record per line, e.g. Codex rollout-*.jsonl) or a JSON file holding an
    array / {messages|conversation|history|items:[...]} (e.g. Cline
    api_conversation_history.json). Extend `discover()` to point this at a store.
    Markdown logs (Aider) and SQLite (Cursor) need bespoke parsers — see
    references/extending-to-other-agents.md."""
    records = []
    if path.endswith(".jsonl"):
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    else:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (json.JSONDecodeError, OSError):
            return None, []
        if isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            for k in ("messages", "conversation", "history", "items"):
                if isinstance(data.get(k), list):
                    records = data[k]
                    break

    rows, t_first, title = [], None, None
    for rec in records:
        ts = rec.get("timestamp") or rec.get("ts") or rec.get("created_at") if isinstance(rec, dict) else None
        if ts and not t_first:
            t_first = str(ts)
        m = _oai_message(rec)
        if not m:
            continue
        role = (m.get("role") or "").lower()
        if role in _OAI_USER:
            norm = "user"
        elif role in _OAI_ASSISTANT:
            norm = "assistant"
        else:
            continue  # system / tool / developer -> drop
        txt = _oai_text(m.get("content"))
        if not txt.strip():
            continue
        rows.append((norm, txt))
        if norm == "user" and title is None:
            title = txt.strip().replace("\n", " ")[:60]
    if not t_first:
        try:
            import datetime
            t_first = datetime.datetime.fromtimestamp(os.path.getmtime(path)).isoformat()
        except OSError:
            t_first = ""
    header = {
        # path-hash: generic stores often reuse a fixed filename per session
        # (Cline api_conversation_history.json) or a uuid-tail (Codex rollout-*),
        # so hash the full path for a collision-free id.
        "id": hashlib.sha1(path.encode()).hexdigest()[:8],
        "title": title or os.path.basename(path),
        "timestamp": t_first,
        "store": "generic",
    }
    return header, rows


# ---- discovery -------------------------------------------------------------

def discover(project, include_brainstorm):
    """Return list of (parser, path) for every session in scope.

    `project` is a substring matched against store dir names, e.g.
    'hijra-mizan-mizan'. OMP and Claude Code encode the project path into the
    dir name with different schemes, so we match by substring rather than
    reconstructing the exact encoding.
    """
    found = []  # (parser, path)

    # 1. in-repo OMP HTML exports
    for p in sorted(glob.glob(".omp/exports/*.html")):
        found.append((parse_omp_html, p))

    # 2. OMP native store  (~/.omp/AGENT/sessions/<slug>/*.jsonl)
    for d in sorted(glob.glob(os.path.join(HOME, ".omp/agent/sessions/*"))):
        if project in os.path.basename(d):
            for p in sorted(glob.glob(os.path.join(d, "*.jsonl"))):
                found.append((parse_omp_native, p))

    # 3. Claude Code store  (~/.claude/projects/<slug>/*.jsonl)
    cc_targets = [project]
    if include_brainstorm:
        cc_targets.append(re.sub(r"-mizan$", "-brainstorm", project))
    for d in sorted(glob.glob(os.path.join(HOME, ".claude/projects/*"))):
        base = os.path.basename(d)
        if any(t in base for t in cc_targets):
            for p in sorted(glob.glob(os.path.join(d, "*.jsonl"))):
                found.append((parse_claude_code, p))

    # 4. OTHER AGENTS — extension point. Add a block per agent whose sessions you
    #    want to mine. Reuse `parse_openai_style` for JSONL/JSON message stores;
    #    write a bespoke parser for Markdown/SQLite. See
    #    references/extending-to-other-agents.md. Examples (paths verified 2026.06,
    #    drift across versions/OS — confirm before relying):
    #
    #    # OpenAI Codex CLI — ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl (NOT
    #    # dir-scoped to a project; filter by a `cwd`/`workspace` field per record
    #    # or by content, else you mine every project):
    #    for p in sorted(glob.glob(os.path.join(HOME, ".codex/sessions/*/*/*/rollout-*.jsonl"))):
    #        found.append((parse_openai_style, p))
    #
    #    # Cline (VS Code) — globalStorage tasks; api_conversation_history.json is a
    #    # JSON array of OpenAI-style messages:
    #    cline = os.path.join(HOME, ".config/Code/User/globalStorage/saoudrizwan.claude-dev/tasks")
    #    for p in sorted(glob.glob(os.path.join(cline, "*/api_conversation_history.json"))):
    #        found.append((parse_openai_style, p))

    return found


# ---- profiling / dedupe / packing -----------------------------------------

def profile_all(found, current_session_id):
    """Parse + profile every session; dedupe by id (prefer richer store)."""
    by_id = {}  # id8 -> profile dict
    store_rank = {"omp-export": 3, "omp": 2, "cc": 1}
    for parser, path in found:
        try:
            header, rows = parser(path)
        except Exception as exc:  # noqa: BLE001 - keep going on a bad file
            print(f"  !! failed to parse {path}: {exc}", file=sys.stderr)
            continue
        if not header:
            continue
        sid = header["id"]
        if sid == current_session_id:
            continue  # never mine the running session
        sig = sum(len(t) for _, t in rows)
        n_user = sum(1 for r, _ in rows if r.startswith("user"))
        prof = {
            "id": sid,
            "title": header["title"],
            "timestamp": header["timestamp"],
            "store": header["store"],
            "path": path,
            "parser": parser.__name__,
            "rows": rows,
            "sig": sig,
            "n_user": n_user,
        }
        prev = by_id.get(sid)
        if prev is None or store_rank.get(prof["store"], 0) > store_rank.get(prev["store"], 0):
            by_id[sid] = prof
    return sorted(by_id.values(), key=lambda p: (p["store"], p["timestamp"]))


ROLE_LABEL = {
    "user": "USER",
    "assistant": "ASSISTANT",
    "user~sub": "USER (subagent)",
    "assistant~sub": "ASSISTANT (subagent)",
    "custom:goal-mode-context": "GOAL-CONTEXT",
    "custom:goal-continuation": "GOAL-CONT",
}


def render_session(p):
    parts = [
        "\n\n######################################################################",
        f"# SESSION store={p['store']} id={p['id']} start={p['timestamp']}",
        f"# TITLE: {p['title']}",
        "######################################################################",
    ]
    for role, txt in p["rows"]:
        parts.append(f"\n===== {ROLE_LABEL.get(role, role.upper())} =====\n{txt.rstrip()}")
    return "\n".join(parts)


def bin_pack(profiles, cap):
    """Greedy pack sessions into batches <= cap chars, never splitting a session.
    Packs within a store so batches stay era-coherent."""
    batches = []
    for store in ("cc", "omp", "omp-export"):
        cur, cur_sz = [], 0
        for p in [x for x in profiles if x["store"] == store]:
            if cur and cur_sz + p["sig"] > cap:
                batches.append(cur)
                cur, cur_sz = [], 0
            cur.append(p)
            cur_sz += p["sig"]
        if cur:
            batches.append(cur)
    return batches


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", default=None,
                    help="store-dir substring (default: derived from cwd, e.g. 'hijra-mizan-mizan')")
    ap.add_argument("--out", default=".omp/exports/_extracted",
                    help="output dir for batches/ + manifest.json")
    ap.add_argument("--min-chars", type=int, default=20000,
                    help="substantive threshold; sessions below this are skipped as trivial")
    ap.add_argument("--cap", type=int, default=300000,
                    help="max signal chars per batch file (subagent-sized)")
    ap.add_argument("--current-session", default="",
                    help="8-char id of the running session to exclude (avoid mining yourself)")
    ap.add_argument("--include-brainstorm", action="store_true",
                    help="also mine the sibling brainstorm repo store")
    ap.add_argument("--list", action="store_true",
                    help="profile and print only; write nothing")
    args = ap.parse_args()

    project = args.project
    if not project:
        cwd = os.getcwd().rstrip("/")
        parts = cwd.split("/")
        project = "-".join(parts[-2:]) if len(parts) >= 2 else parts[-1]
    print(f"project match = {project!r}")

    found = discover(project, args.include_brainstorm)
    print(f"discovered {len(found)} session files across stores")
    profiles = profile_all(found, args.current_session)
    print(f"{len(profiles)} unique sessions after dedupe\n")

    sub = [p for p in profiles if p["sig"] >= args.min_chars]
    skipped = len(profiles) - len(sub)
    by_store = Counter(p["store"] for p in sub)
    print(f"{'start':16} {'store':11} {'id':9} {'user':>4} {'sig(K)':>7} title")
    for p in sorted(profiles, key=lambda x: x["timestamp"]):
        mark = " " if p["sig"] >= args.min_chars else "·"
        print(f"{mark}{p['timestamp'][:16]:15} {p['store']:11} {p['id']:9} "
              f"{p['n_user']:>4} {p['sig']//1000:>7} {str(p['title'])[:46]}")
    print(f"\nsubstantive={len(sub)} (skipped {skipped} below {args.min_chars} chars) "
          f"by store={dict(by_store)}")
    print(f"total substantive signal = {sum(p['sig'] for p in sub)/1e6:.2f}M chars "
          f"(~{sum(p['sig'] for p in sub)//4000}K tokens)")

    if args.list:
        return

    batch_dir = os.path.join(args.out, "batches")
    os.makedirs(batch_dir, exist_ok=True)
    batches = bin_pack(sub, args.cap)
    manifest = []
    for bi, b in enumerate(batches):
        body = f"# BATCH {bi:02d}  store={b[0]['store']}  sessions={len(b)}\n" + "".join(
            render_session(p) for p in b
        )
        fp = os.path.join(batch_dir, f"batch-{bi:02d}.txt")
        with open(fp, "w", encoding="utf-8") as fh:
            fh.write(body)
        manifest.append({
            "batch": bi,
            "store": b[0]["store"],
            "file": f"batches/batch-{bi:02d}.txt",
            "chars": len(body),
            "sessions": [{"id": p["id"], "start": p["timestamp"][:16], "title": p["title"]} for p in b],
        })
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1, ensure_ascii=False)
    print(f"\nwrote {len(batches)} batch files + manifest.json to {args.out}")
    for m in manifest:
        print(f"  batch-{m['batch']:02d} [{m['store']}] {m['chars']//1000:>4}K {len(m['sessions'])} sess")


if __name__ == "__main__":
    main()
