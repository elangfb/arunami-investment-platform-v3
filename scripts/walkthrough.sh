#!/usr/bin/env bash
# Mizan flow walkthrough — interactive, step-gated, MULTI-ACCOUNT browser tour (dev only).
#
# Drives a headed Helium browser through the full 6-stage origination flow via
# `agent-browser`, switching to the REAL role-owner account at each desk handoff
# (RM → Legal → RM-Analis → TL → RA → RTL → Komite → RM),
# pausing before each step for a confirm (press Y / Enter). Encodes the workarounds
# from the 2026.06.05 dogfood walkthrough (docs/sessions/2026.06.05-flow-walkthrough/):
#   F1  login: the Firebase emulator account chooser only advances on a NATIVE el.click()
#       (CDP coordinate clicks are swallowed by mdc-ripple).
#   F3  intake: the dev "Autofill" pill is RETIRED (resources/dummy-data/ is the new source of
#       sample data) — the form is filled by setting React-controlled inputs, since a raw
#       el.value= assignment is ignored by React. Submit via a native button.click().
#   F4  MUAP/RSK ladders live below the fold in an INNER scroll container → scrollIntoView().
#   F6  agent-browser `eval` VM is persistent across calls → every eval body is an IIFE so
#       top-level `const`s are block-scoped and the script stays re-runnable.
# Account switching uses the GET /api/auth/logout endpoint (clears the cookie → /login),
# then re-runs the Google popup and native-picks the target persona by email.
#
# Personas (seeded by `pnpm seed:emu`; src/lib/seed-data/{users,demo-logins}.ts):
#   RM      siti.ao@example.com    Siti Rahma      relationship-manager → intake + S2 SLIK/Pefindo+Kol + S3 MUAP + pencairan (S1-S3, S6)
#   LEGAL   laila.lg@example.com   Laila Ahmadi    legal            → S2 verifikasi dokumen
#   RA      ahmad.rt@example.com   Ahmad Fauzi     risk-team        → S4 RSK author
#   ANALIS  budi.la@example.com    Budi Santoso    relationship-manager → S3 5C+1S + MUAP author (RM)
#   TL      teguh.tl@example.com   Teguh Laksana   team-leader      → MUAP checker (→ MUAP beku)
#   RTL     rini.rtl@example.com   Rini Tania Lestari risk-team-leader → RSK checker (→ RSK beku)
#   KOMITE  dewi.cm@example.com    Dewi Kirana     committee (chair)→ S5 committee decision
#
# Prereqs: `pnpm dev` (:3000) + `scripts/emulator.sh` (:9099), `pnpm seed:emu`, and
#          `agent-browser` installed (`npm i -g agent-browser && agent-browser install`).
#
# Usage:
#   scripts/walkthrough.sh                 # interactive, multi-account, confirm each step
#   SOLO=1 scripts/walkthrough.sh          # single account throughout (PERSONA_EMAIL, default superadmin)
#   AUTO=1 scripts/walkthrough.sh          # hands-free (AUTO_DELAY=secs between steps)
#   WALK_FROM=8 WALK_TO=13 scripts/walkthrough.sh   # run only steps 8..13
#   PERSONA_EMAIL=hendra.mg@example.com SOLO=1 scripts/walkthrough.sh   # tour as one role
#
# Confirm prompt: Enter/Y = run step · s = skip · q = quit.
set -uo pipefail

# ── Config (override via env) ────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:3000}"
EMU_URL="${EMU_URL:-http://localhost:9099}"
SESSION="${SESSION:-mizan}"
HELIUM="${HELIUM:-/opt/helium-browser-bin/helium}"
SHOTS="${SHOTS:-/tmp/mizan-walkthrough}"
WALK_FROM="${WALK_FROM:-1}"
WALK_TO="${WALK_TO:-999}"
AUTO="${AUTO:-0}"
AUTO_DELAY="${AUTO_DELAY:-1}"
SOLO="${SOLO:-0}"                                  # 1 = stay on PERSONA_EMAIL the whole tour
PERSONA_EMAIL="${PERSONA_EMAIL:-superadmin@example.com}"

# Persona emails (override any to point at a different seeded login).
RM="${RM:-siti.ao@example.com}"
LEGAL="${LEGAL:-laila.lg@example.com}"
RA="${RA:-ahmad.rt@example.com}"
ANALIS="${ANALIS:-budi.la@example.com}"
TL="${TL:-teguh.tl@example.com}"
RTL="${RTL:-rini.rtl@example.com}"
KOMITE="${KOMITE:-dewi.cm@example.com}"

# Representative seed apps per stage (from /pipeline on 2026.06.05).
APP_S1="${APP_S1:-FOS-2026-001}"   # Document Submission
APP_S2="${APP_S2:-FOS-2026-003}"   # Legal, Agunan & Biro (RM-coordinated)
APP_S3="${APP_S3:-FOS-2026-006}"   # Feasibility 5C+1S + MUAP (TL rung pending)
APP_S4="${APP_S4:-FOS-2026-008}"   # Risk Review (RTL rung pending)
APP_S5="${APP_S5:-FOS-2026-026}"   # Committee Decision
APP_S6="${APP_S6:-FOS-2026-035}"   # Pencairan (mid-disbursement)

# ── Helpers ──────────────────────────────────────────────────────────────────
c_dim=$'\033[2m'; c_bold=$'\033[1m'; c_cyan=$'\033[36m'; c_yellow=$'\033[33m'; c_grn=$'\033[32m'; c_off=$'\033[0m'
SHOT_N=0
CURRENT_EMAIL=""
# Prefer the controlling terminal for prompts/notes; fall back to stderr when there
# is no usable tty (e.g. AUTO=1 under CI) so writes never fail under `set -u`.
if { : > /dev/tty; } 2>/dev/null; then TTY=/dev/tty; else TTY=/dev/stderr; fi

ab()  { agent-browser --session "$SESSION" "$@"; }
js()  { agent-browser --session "$SESSION" eval --stdin; }   # feed JS via heredoc
go()  { ab open "$BASE_URL$1" >/dev/null; ab wait --load networkidle >/dev/null 2>&1 || true; sleep "${2:-1}"; }
note(){ printf '   %s%s%s\n' "$c_dim" "$*" "$c_off" > "$TTY"; }

shot() {
  SHOT_N=$((SHOT_N + 1))
  local p; p="$SHOTS/$(printf '%02d' "$SHOT_N")-$1.png"
  ab screenshot "$p" >/dev/null 2>&1 && printf '   %s📸 %s%s\n' "$c_dim" "$p" "$c_off" > "$TTY"
}

persona_label() {
  case "$1" in
    "$RM")     echo "Siti Rahma · RM (intake+pencairan)" ;;
    "$LEGAL")  echo "Laila Ahmadi · Legal Officer" ;;
    "$RA")     echo "Ahmad Fauzi · Risk Analyst (RSK)" ;;
    "$ANALIS") echo "Budi Santoso · RM Analis (MUAP)" ;;
    "$TL")     echo "Teguh Laksana · Team Leader" ;;
    "$RTL")    echo "Rini Tania Lestari · Risk Team Leader" ;;
    "$KOMITE") echo "Dewi Kirana · Ketua Komite" ;;
    *)         echo "$1" ;;
  esac
}

# Pick the persona row in the emulator chooser (native click — F1). Returns the eval result.
pick_account() {
  js <<EOF
(() => {
  const want = "$1";
  const el = [...document.querySelectorAll('.js-reuse-account')].find(n => (n.textContent || '').includes(want));
  if (el) el.click();
  return el ? 'picked ' + want : 'NOT FOUND ' + want;
})();
EOF
}

login_as() {
  local email="$1"
  [[ "$email" == "$CURRENT_EMAIL" ]] && { note "tetap login sebagai $(persona_label "$email")"; return 0; }
  note "ganti akun → $(persona_label "$email")"
  ab open "$BASE_URL/api/auth/logout" >/dev/null 2>&1 || true   # clears cookie → /login (F: GET logout)
  ab wait --load networkidle >/dev/null 2>&1 || true; sleep 1
  # Trusted gesture (CDP click) is required — signInWithPopup's window.open is blocked for a
  # synthetic/native click. `find role button --name` resolves the a11y button (text//aria//xpath
  # selectors are NOT supported by this build's `click`). The popup auto-focuses, so pick on it.
  ab find role button click --name "Masuk dengan Google" >/dev/null 2>&1 || true
  sleep 3
  local res; res="$(pick_account "$email")"     # native click on the auto-focused emulator popup (F1)
  sleep 2
  ab tab t1 >/dev/null 2>&1 || true
  ab wait --load networkidle >/dev/null 2>&1 || true; sleep 1
  local url; url="$(ab get url 2>/dev/null)"
  if [[ "$url" == *"/login"* || "$res" == *"NOT FOUND"* ]]; then
    note "${c_yellow}⚠ login mungkin gagal ($res; url=$url). Akun ter-seed? jalankan: pnpm seed:emu${c_off}"
  else
    note "${c_grn}✓ login: $(persona_label "$email") — $url${c_off}"
  fi
  CURRENT_EMAIL="$email"
}

confirm() {  # 0 = run, 1 = skip; exits on quit
  if [[ "$AUTO" == "1" ]]; then sleep "$AUTO_DELAY"; return 0; fi
  local ans
  printf '   %s[Enter/Y = jalankan · s = lewati · q = keluar]%s > ' "$c_yellow" "$c_off" > "$TTY"
  read -r ans < /dev/tty || { echo > "$TTY"; exit 0; }
  case "${ans,,}" in
    ''|y|ya|yes) return 0 ;;
    s|skip|lewati) return 1 ;;
    q|quit|keluar) printf '   keluar.\n' > "$TTY"; exit 0 ;;
    *) return 0 ;;
  esac
}

# ── Shared views ─────────────────────────────────────────────────────────────
scroll_to() {  # $1 = heading text fragment; scrolls the inner AppShell container (F4)
  js <<EOF
(() => {
  const f = "$1";
  const h = [...document.querySelectorAll('h1,h2,h3,h4,div,section')].find(n => (n.textContent || '').slice(0, 60).includes(f));
  if (h) h.scrollIntoView({ block: 'start' });
  return h ? 'scrolled: ' + f : 'tidak ketemu: ' + f;
})();
EOF
}
view_muap_ladder() { go "/applications/$APP_S3?view=muap"; scroll_to "Rantai Persetujuan MUAP" >/dev/null; sleep 1; shot "$1"; }
view_rsk_ladder()  { go "/applications/$APP_S4?view=rsk";  scroll_to "Rantai Persetujuan RSK"  >/dev/null; sleep 1; shot "$1"; }

# ── Steps ────────────────────────────────────────────────────────────────────
s_boot() {
  note "Buka Helium (headed) → $BASE_URL"
  ab --headed --executable-path "$HELIUM" open "$BASE_URL" >/dev/null
  ab wait --load networkidle >/dev/null 2>&1 || true; sleep 1
  shot "boot"
}
s_beranda() {
  go "/dashboard"
  note "Beranda Saya — papan tugas pribadi RM (My TODO / In Progress / Submitted)"
  shot "rm-beranda"
}
s_aplikasi_baru() {
  go "/applications/new"
  note "Aplikasi Baru (RM-led): Identitas Nasabah + Detail Pembiayaan + Agunan"
  shot "rm-aplikasi-baru"
}
s_buat_aplikasi() {
  note "Isi form intake dari persona dummy (resources/dummy-data/andi-pratama) — dropdown sudah default-nya pas"
  js <<'EOF'
(() => {
  // Set a React-controlled field so its onChange fires (a raw el.value= is swallowed by React).
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return id + ' tidak ada';
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  };
  // Persona andi-pratama: Individu · Murabahah · Tanpa Agunan · Karyawan · Belum Menikah —
  // all of which are the form defaults, so only the free-text/number fields need filling.
  return {
    nama: set('nasabahName', 'Andi Pratama'),
    telp: set('phoneNumber', '081298765432'),
    plafond: set('plafond', '60000000'),
    tenor: set('tenorMonths', '24'),
    tujuan: set('purpose', 'Pembelian perlengkapan dan renovasi dapur rumah tinggal.'),
  };
})();
EOF
  sleep 1; shot "rm-aplikasi-terisi"
  note "Buat Aplikasi (submit via native click)"
  js <<'EOF'
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Buat Aplikasi');
  if (btn) btn.click();
  return btn ? 'submitted' : 'tombol Buat Aplikasi tidak ada';
})();
EOF
  ab wait --load networkidle >/dev/null 2>&1 || true; sleep 1
  note "aplikasi baru dibuat → $(ab get url 2>/dev/null)"
  shot "rm-pipeline-setelah-buat"
}
s_pipeline() {
  go "/pipeline"
  note "Pipeline Pembiayaan — read-only, dikelompokkan per 6 tahap (transisi di halaman detail)"
  shot "rm-pipeline"
}
s_stage1() {
  go "/applications/$APP_S1"
  note "Stage 1 Document Submission — Tugas Anda RM (atestasi AML, OCR NIK, dokumen) → Kirim ke Legal, Agunan & Biro"
  shot "s1-rm-kokpit"
}
s_stage1_data() {
  go "/applications/$APP_S1?view=data"
  note "Section Data (RM+RA) — intake + konfirmasi sumber OCR (NIK ⚠ sampai dikonfirmasi)"
  shot "s1-rm-data"
}
s_stage2_legal() {
  go "/applications/$APP_S2"
  note "Stage 2 — sebagai LEGAL: Tugas Anda 'Verifikasi dokumen → kirim Review Legal ke Feasibility'"
  note "  catatan: role Legal direncanakan jadi 'Legal & Appraisal' (lihat findings D2)"
  shot "s2-legal"
}
s_stage2_slik() {
  go "/applications/$APP_S2"
  note "Stage 2 — sebagai RM: Tugas Anda 'Input SLIK/Pefindo + Kolektibilitas → kirim SLIK ke Feasibility' (SLIK RM-owned, D1/ADR-0007)"
  shot "s2-slik"
}
s_stage3() {
  go "/applications/$APP_S3"
  note "Stage 3 — sebagai RM Analis: Analisa 5C+1S ScoreOverview /100 (skor DETERMINISTIK; AI hanya draf narasi)"
  shot "s3-analis-5c1s"
}
s_stage3_muap() {
  note "Stage 3 — sebagai RM Analis: MUAP + Rantai Persetujuan (Pengaju RM → TL)"
  view_muap_ladder "s3-analis-muap"
}
s_muap_tl() {
  note "MUAP checker — sebagai TEAM LEADER (Teguh): bila giliran → Setuju / Kembalikan ke Pengaju (→ MUAP beku)"
  view_muap_ladder "s3-tl-muap"
}
s_stage4() {
  go "/applications/$APP_S4?view=rsk"
  note "Stage 4 — sebagai RISK ANALYST: Rekomendasi (Approve/Conditional/Reject) + Saran AI (advisory, bukan keputusan)"
  shot "s4-ra-rsk"
}
s_rsk_rtl() {
  note "RSK checker — sebagai RISK TEAM LEADER (Rini): bila giliran → Setuju / Kembalikan ke Pengaju (→ RSK beku)"
  view_rsk_ladder "s4-rtl-rsk"
}
s_stage5() {
  go "/applications/$APP_S5"
  note "Stage 5 — sebagai KOMITE: Tugas Anda 'Putuskan & tanda tangani MoM di Ruang Komite'"
  shot "s5-komite-kokpit"
}
s_komite_hub() {
  go "/komite"
  note "Rapat Komite — tab Jadwal: sesi, agenda aplikasi, anggota komite (Ketua), ringkasan keputusan"
  shot "s5-rapat-komite"
}
s_keputusan() {
  ab find text "Keputusan" click >/dev/null 2>&1 || true; sleep 1
  note "Tab Keputusan — register keputusan komite (DecisionChip: Approve/Conditional/Reject + catatan)"
  shot "s5-keputusan"
}
s_stage6() {
  go "/applications/$APP_S6?view=pencairan"
  note "Stage 6 — sebagai RM: Alur Pencairan (Verifikasi Final → Proses Akad → Siap Cair → Cair) + Syarat Pencairan"
  shot "s6-rm-pencairan"
}

# ── Step registry (title / function / actor — same index) ────────────────────
TITLES=(
  "Boot — buka Helium (headed)"
  "RM (Siti): login + Beranda Saya"
  "RM (Siti): Aplikasi Baru — form intake"
  "RM (Siti): Isi form (persona dummy) + Buat Aplikasi → Stage 1"
  "RM (Siti): Pipeline Pembiayaan"
  "RM (Siti): Stage 1 kokpit (Document Submission)"
  "RM (Siti): Stage 1 — Data (konfirmasi OCR)"
  "Legal (Laila): Stage 2 — Verifikasi Dokumen"
  "RM (Siti): Stage 2 — Input SLIK/Pefindo + Kol"
  "RM Analis (Budi): Stage 3 — Feasibility 5C+1S"
  "RM Analis (Budi): Stage 3 — MUAP (rantai persetujuan)"
  "Team Leader (Teguh): MUAP checker (→ MUAP beku)"
  "Risk Analyst (Ahmad): Stage 4 — RSK rekomendasi + Saran AI"
  "Risk Team Leader (Rini): RSK checker (→ RSK beku)"
  "Komite (Dewi): Stage 5 — Committee Decision"
  "Komite (Dewi): Rapat Komite hub"
  "Komite (Dewi): Keputusan komite"
  "RM (Siti): Stage 6 — Pencairan"
)
FNS=(
  s_boot s_beranda s_aplikasi_baru s_buat_aplikasi s_pipeline s_stage1 s_stage1_data
  s_stage2_legal s_stage2_slik s_stage3 s_stage3_muap s_muap_tl
  s_stage4 s_rsk_rtl s_stage5 s_komite_hub s_keputusan s_stage6
)
ACTORS=(
  "" "$RM" "$RM" "$RM" "$RM" "$RM" "$RM"
  "$LEGAL" "$RM" "$ANALIS" "$ANALIS" "$TL"
  "$RA" "$RTL" "$KOMITE" "$KOMITE" "$KOMITE" "$RM"
)

# ── Preflight ────────────────────────────────────────────────────────────────
preflight() {
  command -v agent-browser >/dev/null 2>&1 || { echo "✗ agent-browser tidak ada (npm i -g agent-browser && agent-browser install)"; exit 1; }
  [[ -x "$HELIUM" ]] || echo "⚠ Helium tidak ada di $HELIUM (set HELIUM=… atau hapus --executable-path)"
  curl -s -m 3 -o /dev/null "$BASE_URL" || echo "⚠ dev server tidak merespons di $BASE_URL (jalankan: pnpm dev)"
  curl -s -m 3 -o /dev/null "$EMU_URL" || echo "⚠ auth emulator tidak merespons di $EMU_URL (jalankan: scripts/emulator.sh)"
  mkdir -p "$SHOTS"
}

main() {
  preflight
  local total="${#FNS[@]}"
  local mode; [[ "$SOLO" == "1" ]] && mode="SOLO ($PERSONA_EMAIL)" || mode="multi-akun per role"
  printf '\n%sMizan walkthrough%s — %s langkah · %s · sesi "%s" · shots → %s\n' "$c_bold" "$c_off" "$total" "$mode" "$SESSION" "$SHOTS"
  printf '%sKonfirmasi tiap langkah: Y/Enter = jalankan, s = lewati, q = keluar. AUTO=1 hands-free.%s\n' "$c_dim" "$c_off"
  local i
  for ((i = 0; i < total; i++)); do
    local n=$((i + 1))
    (( n < WALK_FROM || n > WALK_TO )) && continue
    local want="${ACTORS[$i]}"
    [[ "$SOLO" == "1" && -n "$want" ]] && want="$PERSONA_EMAIL"
    local who=""; [[ -n "$want" && "$want" != "$CURRENT_EMAIL" ]] && who="  ${c_dim}→ $(persona_label "$want")${c_off}"
    printf '\n%s━━ %s/%s — %s%s%s\n' "$c_cyan" "$n" "$total" "${TITLES[$i]}" "$c_off" "$who"
    if confirm; then
      [[ -n "$want" && "$want" != "$CURRENT_EMAIL" ]] && login_as "$want"
      "${FNS[$i]}"
    else
      printf '   (dilewati)\n'
    fi
  done
  printf '\n%s✓ Selesai.%s Screenshot di %s. Browser tetap terbuka (sesi "%s").\n' "$c_bold" "$c_off" "$SHOTS" "$SESSION"
}

trap 'printf "\n  dihentikan.\n"; exit 130' INT
main "$@"
