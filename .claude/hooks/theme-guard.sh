#!/usr/bin/env bash
# ============================================================================
# Theme Guard — harness-enforced theme compliance (SafePay/Deep)
# ----------------------------------------------------------------------------
# ทำไม: gate ทั้งหมดที่บังคับ theme เดิมเป็น "model-executed" (developer/reviewer
# เช็คเอง) → หลอน PASS ได้. hook นี้ให้ "harness" (ไม่ใช่ AI) รัน grep เองหลังทุก
# Write/Edit แล้ว block ถ้าเจอ violation — AI โกหกไม่ได้เพราะไม่ใช่คนเช็ค.
#
# ครอบ Hard Rule 7 (Paces arbitrary value) / 9 (react-toastify) / 10 (chart lib)
# / 12 (emoji) + ธีมผิด subdomain (Vuexy/MUI bleed เข้า Paces).
#
# carve-out: บรรทัดที่มี comment (`//` หรือ `/*`) = ผ่าน — ตรงกติกา HR7
# "เว้นจำเป็นจริง (raised-FAB/safe-area) เขียน comment กำกับ".
#
# exit 2 = block + feedback เด้งกลับ AI ให้แก้. exit 0 = ผ่าน.
# ============================================================================
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# ไม่มี path / ไฟล์ไม่มีจริง (เช่นถูกลบ) → ไม่เกี่ยว
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

# เฉพาะไฟล์ UI
case "$file" in
  *.tsx|*.ts|*.jsx|*.js|*.css) : ;;
  *) exit 0 ;;
esac

violations=""
add() { violations="${violations}$1"$'\n'; }

# grep -nE + ตัด "คอมเมนต์" ออกก่อนค่อย match (carve-out ของ HR7)
#
# 2026-08-09: เดิมเป็น `grep -vE '//|/\*'` ซึ่งกรองได้เฉพาะบรรทัดที่ **มีเครื่องหมายอยู่ในบรรทัด
# นั้นเอง** — บรรทัดกลางบล็อก `/* ... */` ที่ไม่มี `*` นำหน้าจึงหลุดมาแดง. เคสจริง: เขียนค่า
# contrast ไว้ในคอมเมนต์เพื่ออธิบายว่าทำไมต้องเปลี่ยนจาก text-primary เป็น text-primary-ink
# แล้ว hook block ทันที → คนแก้ต้องเลือกระหว่าง "ลบเหตุผลทิ้ง" กับ "ปิด hook" ซึ่งแย่ทั้งคู่
# และมันลงโทษการเขียนคอมเมนต์ที่ดีโดยเฉพาะ (ยิ่งอธิบายละเอียดยิ่งมีโอกาสโดน)
#
# ยกตรรกะไล่สถานะบล็อกมาจากด่าน HR12 ข้างล่างซึ่งแก้เรื่องนี้ไปแล้ว — ที่นั่นเขียนเหตุผลเต็มไว้
# ว่าทำไมกรองด้วย `^\s*(//|/\*|\*)` ไม่พอ. สองด่านนี้ต้องมองคอมเมนต์เหมือนกัน ไม่งั้นกฎเดียวกัน
# ("คอมเมนต์กำกับ = ผ่าน") จะแปลคนละอย่างในไฟล์เดียวกัน
if command -v perl >/dev/null 2>&1; then
  scan_nocomment() {
    TG_RE="$1" perl -CSD -ne '
      BEGIN { $re = qr/$ENV{TG_RE}/ }
      # อยู่กลางบล็อก /* ... */ → ข้ามเสมอ (นี่คือส่วนที่เพิ่มเข้ามา)
      if ($blk) { $blk = 0 if m{\*/}; next }
      $blk = 1 if m{/\*} && !m{\*/};
      # 🛑 บรรทัดที่ "มีเครื่องหมายคอมเมนต์อยู่ในตัวเอง" ยังผ่านเหมือนเดิม — นี่คือกลไก carve-out
      # ที่ HR7 ประกาศไว้ตรง ๆ ("ถ้าจำเป็นจริงเขียน comment บรรทัดนั้นกำกับ") ห้ามเปลี่ยนเป็น
      # "strip คอมเมนต์แล้ว match โค้ดที่เหลือ" เพราะนั่นทำให้เขียนคอมเมนต์กำกับแล้วยังโดนจับ
      # = ยกเลิก carve-out ทั้งกฎโดยไม่ตั้งใจ (เกือบพลาดตอนแก้ hook นี้เอง 2026-08-09)
      next if m{//} || m{/\*};
      print "$.:$_" if $_ =~ $re;
    ' "$file" 2>/dev/null || true
  }
else
  # ไม่มี perl → ถอยกลับไปพฤติกรรมเดิม (หลวมกว่าแต่ไม่ปล่อยของผิดผ่าน)
  scan_nocomment() { grep -nE "$1" "$file" 2>/dev/null | grep -vE '//|/\*' || true; }
fi
scan()           { grep -nE "$1" "$file" 2>/dev/null || true; }

is_paces=false
is_marketing=false
printf '%s' "$file" | grep -q 'src/app/(paces)/'      && is_paces=true
printf '%s' "$file" | grep -q 'src/app/(marketing)/'  && is_marketing=true

# ---------------------------------------------------------------------------
# Paces (seller/admin) — Hard Rule 7/9/10/12 + no Vuexy bleed
# ---------------------------------------------------------------------------
if [ "$is_paces" = true ]; then
  m=$(scan_nocomment '(text|bg|rounded|shadow|w|h|p|m|gap|top|left|right|bottom|size|border|inset|min-\w|max-\w)-\[')
  [ -n "$m" ] && add "[HR7] arbitrary Tailwind value — ใช้ Paces token/primitive (.card/.btn/text-default-*/size-*/rounded-lg) แทน. ถ้าจำเป็นจริง (safe-area/raised-FAB) เขียน comment บรรทัดนั้นกำกับ:
$m"

  m=$(scan_nocomment '#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\b')
  [ -n "$m" ] && add "[HR7] hardcode hex color — ใช้ token (bg-primary/text-default-*/bg-{semantic}/15). ถ้าจำเป็นเขียน comment กำกับ:
$m"

  m=$(scan "from ['\"]react-toastify['\"]|import .*react-toastify|\btoast\.(success|error|warning|info)\(")
  [ -n "$m" ] && add "[HR9] react-toastify/toast() ในหน้า (paces) — ใช้ pacesToast จาก @/lib/paces-toast แทน:
$m"

  m=$(scan "from ['\"](react-apexcharts|echarts|chart\.js|recharts)['\"]")
  [ -n "$m" ] && add "[HR10] import chart lib ตรง — ต้องผ่าน @/components/wrappers/ApexChart + copy structure จาก theme/paces charts:
$m"

  m=$(scan "from ['\"]@mui/|from ['\"]@core/|from ['\"]@layouts/|#7367F0|#7367f0")
  [ -n "$m" ] && add "[THEME] Vuexy/MUI bleed เข้า Paces — seller/admin เป็น Preline+Tailwind ไม่มี MUI; ม่วง #7367F0 เป็นของ buyer เท่านั้น (Paces primary = น้ำเงิน bg-primary):
$m"
fi

# ---------------------------------------------------------------------------
# Marketing (buyer/landing/public) — no Paces primitive bleed
# ---------------------------------------------------------------------------
if [ "$is_marketing" = true ]; then
  m=$(scan "from ['\"]@/lib/paces-toast['\"]|pacesToast\.|data-skin=|class(Name)?=['\"][^'\"]*\bhs-(dropdown|collapse|overlay|accordion)\b")
  [ -n "$m" ] && add "[THEME] Paces (Preline) primitive bleed เข้า buyer/Vuexy — ใช้ MUI + react-toastify ฝั่ง (marketing):
$m"
fi

# ---------------------------------------------------------------------------
# Marketing — รัศมีตามบทบาท (DESIGN.md §Shapes · The Container-Is-12 Rule)
# ---------------------------------------------------------------------------
#
# ฝั่ง buyer: ของที่กดได้ 6px · รูป/อวตาร 8px · **การ์ด/แผง 12px** · chip = pill
# นิยามอยู่ที่ธีมจุดเดียว (`@core/theme/overrides/card.ts|accordion.tsx|avatar.ts`)
#
# ด่านนี้จับ 2 ท่าที่ทำให้ค่ากลางหลุดมือ — ทั้งคู่เคยเกิดจริงและไม่มี tsc/eslint ตัวไหนฟ้อง:
#   1. `<Card className='... rounded-* ...'>` — ทับรัศมีของธีมเฉพาะจุด ⇒ การ์ดในหน้าเดียวกัน
#      กลมไม่เท่ากัน (เจอ 5 จุดตอนกวาด 2026-08-30: HeroSection · Pricing · ReportForm ·
#      ScamSearchBar · HowItWorks)
#   2. `shape.borderRadius` ถูกขยับเพื่อ "ทำให้การ์ดกลมขึ้น" — มันเป็น **ตัวคูณ** ของ
#      `borderRadius: N` ทุกตัวใน sx ทั้งระบบ แก้จุดเดียวพังทุกหน้าเงียบ ๆ
# 🛑 ตรวจ **ทุกไฟล์** ไม่ผูกกับ `is_marketing` — `<Card>` ของ MUI ถูกใช้จาก `src/views/**`
#    ด้วย ซึ่งไม่ได้อยู่ใต้ `src/app/(marketing)/` (5 จุดที่เจอตอนกวาดอยู่ใน views ทั้งหมด)
#    ฝั่ง Paces ไม่ได้ใช้ MUI Card อยู่แล้ว ⇒ ตรวจกว้างไม่มีผลข้างเคียง
# ── บันไดรัศมีฝั่ง buyer — จับทุกค่าที่หลุดบันได ไม่ใช่แค่ <Card> ──────────
#
# บันได (marketing.css remap Tailwind ให้ตรง MUI ramp):
#   rounded / -md = 6px  (ปุ่ม อินพุต)
#   rounded-lg    = 8px  (แผ่นไอคอน อวตาร รูปย่อ)
#   rounded-2xl   = 12px (การ์ด แผง กล่อง แถว — ภาชนะ)
#   rounded-full  = pill (chip)
#   + directional: rounded-t/b/s/e-* ตามชุดเดียวกัน
#
# 🛑 ที่ห้าม: `rounded-xl` (10px) · `rounded-3xl` (16) · `rounded-4xl` (24) · `rounded-xs` (2)
#    · `rounded-sm` (4 — สงวนให้ปุ่ม size small ที่ธีมตั้งเอง ไม่ใช่ให้เขียนมือ)
#    · `rounded-[Npx]` ทุกค่า
#
# ทำไมต้องมีด่านนี้ทั้งที่มีด่าน <Card> แล้ว: หน้าที่พังจริง (`/b`, `/u`) **ไม่เคยใช้ `<Card>`**
# มันประกอบการ์ดเองด้วย `div` ทุกใบ ⇒ ด่านที่ผูกกับชื่อคอมโพเนนต์มองไม่เห็นเลยสักใบ
# (ยิงทดสอบ 2026-08-30: `<div className='rounded-2xl bg-white p-6 shadow-sm'>` ผ่านฉลุย)
#
# carve-out: เขียนคอมเมนต์กำกับบรรทัดนั้น (ท่าเดียวกับ HR7) — ตัวตัดคอมเมนต์ด้านล่างจัดการให้
if [ "$is_paces" = false ]; then
  m=$(scan_nocomment "rounded-(xs|sm|xl|3xl|4xl)\b|rounded(-[tbse])?-\[[0-9]+px\]")
  [ -n "$m" ] && add "[SHAPE] รัศมีหลุดบันได buyer — 6px ปุ่ม/อินพุต · 8px แผ่นไอคอน · 12px ภาชนะ · full chip (DESIGN.md §Shapes · The Container-Is-12 Rule). ใช้ rounded / rounded-lg / rounded-2xl / rounded-full · ถ้าเป็นรูปทรงตกแต่งของ section จริง ๆ ให้เขียนคอมเมนต์กำกับบรรทัดนั้น:
$m"
fi

# ── คีย์ที่ไม่มีอยู่จริงใน `sx` (utility ของ Tailwind หลุดเข้ามา) ──────────
#
# 🛑 คลาสอย่าง `pli` `pbs` `pbe` `mbs` `mie` `bs` `is` เป็น **utility ของ Tailwind**
# ไม่ใช่คีย์ของ MUI `sx` และไม่ใช่ชื่อ CSS property ด้วย ⇒ MUI ทิ้งเงียบ ไม่มี error
# ไม่มี warning · tsc ก็ปล่อยผ่านเพราะ `sx` รับคีย์อะไรก็ได้
#
# ที่มา (2026-08-31): `PublicProfileFooter` เขียน `sx={{ pli: 4, pbs: 3, pbe: 4 }}`
# ⇒ วัดบนจอจริงแล้ว footer ได้ **padding 0 ทุกด้าน** มาตลอด และเส้นคั่นห่างการ์ดแค่ 8px
# หัวหน้าทัก 2 รอบว่า "เส้นมันชิด" — ไม่มีเครื่องมือไหนในระบบจับได้เลย
#
# นี่คือคลาสบั๊กที่อันตรายที่สุด: **เขียนแล้วดูเหมือนทำงาน แต่เงียบ**
# ที่ถูกคือใช้คีย์ MUI (`px` `py` `pt` `pb` `mt` `mb` …) หรือชื่อ CSS เต็ม
# (`paddingInline` `marginBlockStart` …)
DEAD_SX='(pli|pis|pie|plb|pbs|pbe|mli|mis|mie|mlb|mbs|mbe|bs|is|bls|ble)[[:space:]]*:'
if grep -qE "sx=\{\{" "$file" 2>/dev/null; then
  m=$(scan_nocomment "^[[:space:]]*$DEAD_SX")
  [ -n "$m" ] && add "[SX] คีย์นี้ไม่มีอยู่ใน MUI \`sx\` — เป็น utility ของ Tailwind ⇒ ถูกทิ้งเงียบ ไม่มี error/warning. ใช้คีย์ MUI (px/py/pt/pb/mt/mb) หรือชื่อ CSS เต็ม (paddingInline/marginBlockStart) แทน:
$m"
fi

# ── tap target ≥ 44px (DESIGN.md §Do's) ────────────────────────────────────
#
# ธีมตั้งพื้นให้แล้วที่ `@core/theme/overrides/{button,icon-button,input}.ts`
# (`minBlockSize: 44`) ⇒ ปกติไม่ต้องเขียนอะไรเพิ่ม · ด่านนี้จับ **การเขียนทับให้เตี้ยลง**
#
# ที่มา (วัดจอจริง 390px 2026-08-31): ก่อนแก้ ฝั่ง buyer มีเป้าที่กดได้ต่ำกว่า 44px
# **48 จุด** — `/dashboard` หน้าเดียว 20 จุด · ปุ่มสูง 30/38/43px ปนกันทั้งระบบ
# กลุ่มผู้ใช้ที่ PRODUCT.md ผูกไว้คือผู้สูงวัย/digital-literacy ต่ำ = กลุ่มที่พลาดมากที่สุด
#
# carve-out: ของที่ "ตาเห็นเล็กแต่พื้นที่แตะใหญ่" (เช่น `&::after{inset:-11px}`)
# ให้เขียนคอมเมนต์กำกับบรรทัดนั้น
# 🛑 จับเฉพาะ `minHeight`/`minBlockSize`/`min-bs-*` — **ไม่จับ `height`/`blockSize`**
# เพราะสองตัวหลังใช้กำหนดขนาดของ *สิ่งที่กดไม่ได้* เต็มไปหมด (badge · จุดไทม์ไลน์ · ราง slider
# · หัว switch · chip) ⇒ ลองจับแล้วได้ 25 ไฟล์ที่ไม่มีอันไหนเป็นเป้าให้นิ้วเลย
# ด่านที่ร้องผิดบ่อยกว่าถูก คือด่านที่คนจะเรียนรู้ที่จะเพิกเฉย
#
# ข้าม `src/@core/**` — ที่นั่นคือธีมที่ *ตั้งขนาดคอมโพเนนต์* เป็นหน้าที่โดยตรง
case "$file" in src/@core/*) : ;; *)
if [ "$is_paces" = false ]; then
  m=$(scan_nocomment "(minHeight|minBlockSize): *(1[0-9]|2[0-9]|3[0-9]|4[0-3]) *[,}]|min-bs-(1|2|3|4|5|6|7|8|9|10)\b")
  [ -n "$m" ] && add "[TAP] เป้าที่กดได้ต้องสูง ≥44px (DESIGN.md §Do's) — ธีมตั้งพื้นให้แล้ว อย่าเขียนทับให้เตี้ยลง · ถ้าเป็นของที่ตาเห็นเล็กแต่พื้นที่แตะใหญ่ (::after inset ติดลบ) ให้เขียนคอมเมนต์กำกับบรรทัด:
$m"
fi
;; esac

# ── padding การ์ด = 20px (DESIGN.md §Cards · The Card-Padding-Is-20 Rule) ──
#
# การ์ด = กล่อง `rounded-2xl` (12px) · ระยะขอบใน **20px = `p-5`** ค่าเดียวทั้งระบบ
# ที่ห้าม: `p-4` (16) `p-6` (24) `p-8` (32) `p-3.5` (14) ฯลฯ บนกล่องที่เป็นการ์ด
#
# ที่มา: ก่อนแก้ 2026-08-30 ฝั่ง buyer มี 13 · 14 · 16 · 20 · 24 · 32px ปนกัน และการ์ด
# "การชำระเงิน" (14px) วางติดกับ "ช่องทางการชำระเงิน" (24px) บนจอเดียว ต่างกัน 10px เห็นด้วยตา
#
# ยกเว้น (เขียนคอมเมนต์กำกับบรรทัด): ไทล์สื่อที่ภาพชนขอบ (`p-0`) · การ์ด auth/OTP (`p-12`)
if [ "$is_paces" = false ]; then
  m=$(scan_nocomment "rounded-2xl[^'\"]*\b(p|pli|plb|px|py)-(0\.5|1|1\.5|2|2\.5|3|3\.5|4|6|7|8|9|10|11|12)\b|\b(p|pli|plb|px|py)-(0\.5|1|1\.5|2|2\.5|3|3\.5|4|6|7|8|9|10|11|12)\b[^'\"]*rounded-2xl")
  [ -n "$m" ] && add "[SPACE] การ์ด (rounded-2xl) ต้องใช้ padding 20px = \`p-5\` ค่าเดียวทั้งระบบ (DESIGN.md §Cards). ไทล์สื่อที่ภาพชนขอบใช้ p-0 · การ์ด auth ใช้ p-12 — ทั้งสองต้องเขียนคอมเมนต์กำกับบรรทัด:
$m"
fi

m=$(scan "<Card[^>]*className=['\"][^'\"]*rounded-")
[ -n "$m" ] && add "[SHAPE] <Card> ห้ามใส่คลาสรัศมีทับธีม — การ์ด buyer = 12px นิยามเดียวที่ @core/theme/overrides/card.ts (DESIGN.md §Shapes · The Container-Is-12 Rule):
$m"

# grep -E ไม่มี negative lookahead ⇒ จับ "บรรทัดที่ประกาศค่า" แล้วคัดตัวที่ไม่ใช่ 6 ด้วย shell
case "$file" in
  *"@core/theme/index.ts")
    m=$(grep -nE "borderRadius: [0-9]+" "$file" 2>/dev/null | grep -vE "borderRadius: 6([^0-9]|$)" || true)
    [ -n "$m" ] && add "[SHAPE] 🛑 shape.borderRadius ต้องเป็น 6 เสมอ — มันคือ **ตัวคูณ** ของ borderRadius: N ทุกตัวใน sx ทั้งระบบ (borderRadius: 2 = 12px วันนี้ จะกลายเป็น 24px ทันที). อยากเปลี่ยนรัศมีการ์ดให้ override ที่ overrides/card.ts:
$m"
    ;;
esac

# ---------------------------------------------------------------------------
# ทุก UI file — emoji (Hard Rule 12) ใช้ perl (unicode, /usr/bin/perl เสถียร)
# ---------------------------------------------------------------------------
#
# 🛑 ไฟล์เทสไม่ใช่ UI — HR12 คุมสิ่งที่ "ผู้ใช้เห็นบนจอ" ไม่ใช่ชื่อเคสที่ขึ้นใน terminal
#
# ที่มา (2026-08-30, PR #45 ด่าน 3 แดง): รีโปใช้ `it('🛑 ...')` เป็นธรรมเนียมมาตลอดเพื่อชี้
# ว่าเคสไหนคือ "แดง = ห้าม merge" — มีอยู่ 14 ไฟล์บน main ที่เขียนแบบนี้ แต่ด่าน 3 ตรวจเฉพาะ
# ไฟล์ที่ PR แตะ ธรรมเนียมนี้จึงไม่เคยชนกฎจนกระทั่ง PR ที่บังเอิญแตะไฟล์เทสหลายใบพร้อมกัน
#
# ⇒ คนแก้ถูกบังคับให้เลือกระหว่าง "ลบเครื่องหมายที่บอกว่าเคสไหนสำคัญ" กับ "ปิด hook"
#   ซึ่งเป็นทางเลือกคู่เดียวกับที่บล็อก carve-out คอมเมนต์ข้างล่างเคยแก้ไปแล้ว
#
# ขอบเขตแคบโดยตั้งใจ: ข้ามเฉพาะ **HR12 ในไฟล์เทส** — ด่านอื่น (HR7/9/10, ธีมผิด subdomain)
# ยังตรวจไฟล์เทสตามปกติ เพราะ import ผิดธีมในเทสยังเป็นสัญญาณจริง
case "$file" in
  *.test.ts|*.test.tsx|*.test.js|*.test.jsx|*/__tests__/*) SKIP_HR12=1 ;;
  *) SKIP_HR12=0 ;;
esac

if [ "$SKIP_HR12" -eq 0 ] && command -v perl >/dev/null 2>&1; then
  # high emoji plane + regional-flag + variation-selector-16 + emoji ตัวฮิตนอก carve-out.
  # เลี่ยง carve-out HR12 (dingbat สีเดียวที่อนุญาต ★☆✓✗♡▾ = 2605/2606/2713/2717/2661/25BE) — ไม่จับ range กว้าง 2600-27BF.
  #
  # ข้ามคอมเมนต์ (// หรือ /* */) — CLAUDE.md carve-out "code comment marker" ไว้ตั้งแต่ต้น
  # แต่ด่านนี้ไม่เคย implement มัน ผลคือ 🛑/⚠️ ที่ใช้ขึ้นต้นคอมเมนต์อธิบายกฎอยู่ทั่วรีโป ทำให้
  # ไฟล์นั้นแดงทุกครั้งที่มีใครแก้บรรทัดไหนก็ตามในไฟล์ แม้ไม่ได้แตะ emoji เลย — คนแก้จึงต้อง
  # เลือกระหว่าง "ลบคอมเมนต์เตือนของคนก่อนหน้า" กับ "ปิด hook" ซึ่งแย่ทั้งคู่
  #
  # ต้องไล่ "สถานะบล็อก" ไม่ใช่ดูว่าบรรทัดขึ้นต้นด้วยอะไร — คอมเมนต์ยาวหลายบรรทัดแบบ
  # /* ... */ ที่ไม่ได้ใส่ * นำหน้าทุกบรรทัด จะมีบรรทัดกลางที่ไม่มีเครื่องหมายใดเลยบนตัวมันเอง
  # (เคสจริง: ShopForm.tsx:585 ขึ้นต้นด้วยช่องว่างแล้วตามด้วย emoji ทันที) การกรองด้วย
  # ^\s*(//|/\*|\*) จึงยังปล่อยผ่านมาแดงเหมือนเดิม
  m=$(perl -CSD -ne '
    my $c = $_;
    if ($blk) { $blk = 0 if $c =~ m{\*/}; next }   # อยู่กลางบล็อก → ข้าม (ปิดบล็อกแล้วค่อยกลับมาสแกน)
    $c =~ s{/\*.*?\*/}{}g;                          # บล็อกที่เปิด-ปิดในบรรทัดเดียว
    if ($c =~ m{/\*}) { $blk = 1; $c =~ s{/\*.*$}{} }
    $c =~ s{//.*$}{};                               # คอมเมนต์ท้ายบรรทัด
    print "$.:$_" if $c =~ /[\x{1F000}-\x{1FAFF}\x{1F1E6}-\x{1F1FF}\x{FE0F}]|[\x{2705}\x{274C}\x{2B50}\x{26A1}\x{2764}\x{2B55}\x{2757}\x{2753}\x{2728}\x{1F004}]/;
  ' "$file" 2>/dev/null || true)
  [ -n "$m" ] && add "[HR12] emoji ใน UI — ใช้ icon จริง (@iconify/react tabler names) แทน. จุดที่ควรมี icon แต่ไม่รู้ตัวไหน = ถาม user ก่อน:
$m"
fi

# ---------------------------------------------------------------------------
if [ -n "$violations" ]; then
  {
    echo "🛑 Theme Guard พบการละเมิด theme convention ใน:"
    echo "   $file"
    echo ""
    printf '%s' "$violations"
    echo "แก้ให้ผ่านก่อน (ดู CLAUDE.md Hard Rules + docs/system/ui-guideline/). ถ้าเป็น carve-out ที่จำเป็นจริง ให้เขียน comment กำกับบรรทัดนั้น."
  } >&2
  exit 2
fi

exit 0
