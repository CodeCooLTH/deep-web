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

# grep -nE + ตัดบรรทัดที่มี comment กำกับออก (carve-out)
scan_nocomment() { grep -nE "$1" "$file" 2>/dev/null | grep -vE '//|/\*' || true; }
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
# ทุก UI file — emoji (Hard Rule 12) ใช้ perl (unicode, /usr/bin/perl เสถียร)
# ---------------------------------------------------------------------------
if command -v perl >/dev/null 2>&1; then
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
