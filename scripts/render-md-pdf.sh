#!/usr/bin/env bash
# Render a markdown doc to a shareable PDF (A4, GitHub-style, Unicode-safe).
# Usage: scripts/render-md-pdf.sh <input.md> [output.pdf]
# Needs: pnpm (fetches `marked` on the fly) + chromium or google-chrome-stable.
set -euo pipefail

IN="${1:?usage: render-md-pdf.sh <input.md> [output.pdf]}"
OUT="${2:-${IN%.md}.pdf}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pnpm --silent dlx marked --gfm -i "$IN" -o "$TMP/body.html"

cat > "$TMP/doc.html" <<'HTML'
<!doctype html><html lang="id"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 22mm 18mm; }
:root { color-scheme: light; }
body { font: 10.5pt/1.55 "IBM Plex Sans", "Noto Sans", sans-serif; color: #1a2333; max-width: 100%; }
h1, h2, h3 { font-family: "IBM Plex Sans", "Noto Sans", sans-serif; color: #0f1c3f; line-height: 1.25; }
h1 { font-size: 20pt; border-bottom: 2px solid #0f1c3f; padding-bottom: 6px; }
h2 { font-size: 14pt; margin-top: 1.6em; border-bottom: 1px solid #d6dbe6; padding-bottom: 3px; }
h3 { font-size: 11.5pt; margin-top: 1.3em; }
h2, h3 { break-after: avoid; }
table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 9.5pt; break-inside: avoid; }
th, td { border: 1px solid #c7cedd; padding: 5px 8px; text-align: left; vertical-align: top; }
th { background: #eef1f7; }
code { font-family: "IBM Plex Mono", "Noto Sans Mono", monospace; font-size: 0.9em; background: #f1f3f8; padding: 1px 4px; border-radius: 3px; }
blockquote { border-left: 3px solid #0f1c3f; margin: 0.8em 0; padding: 2px 14px; background: #f6f7fa; color: #333; }
hr { border: none; border-top: 1px solid #d6dbe6; margin: 1.4em 0; }
li { margin: 0.25em 0; }
a { color: #0f3fa8; text-decoration: none; }
</style></head><body>
HTML
cat "$TMP/body.html" >> "$TMP/doc.html"
echo '</body></html>' >> "$TMP/doc.html"

BROWSER="$(command -v chromium || command -v google-chrome-stable)"
"$BROWSER" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "file://$TMP/doc.html" 2>/dev/null

echo "PDF: $OUT"
