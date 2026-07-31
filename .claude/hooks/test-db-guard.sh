#!/usr/bin/env bash
# ============================================================================
# Test DB Guard — harness-enforced (SafePay/Deep) — Hard Rule 13
# ----------------------------------------------------------------------------
# ทำไม: dev DB = prod DB ตัวเดียวกัน (Supabase แชร์) ไฟล์เทสที่ล้างตารางแบบไม่ scope
# (`deleteMany()` เปล่า ๆ / TRUNCATE / DELETE FROM ไม่มี WHERE) คือคำสั่งลบข้อมูลจริง
# ทั้งฐานที่รอแค่ใครสัก connection ชี้ถูกที่ — guard ที่เป็น runtime check ใน setup.ts
# กันได้เฉพาะตอน "รัน" และเป็น denylist (เช็คคำว่า supabase) ซึ่งพลาดได้ถ้า host เปลี่ยน
#
# hook นี้กันที่ "ตอนเขียน" แทน — harness รันเอง ไม่ใช่ AI เช็คตัวเอง จึงโกหกไม่ได้
#
# ขอบเขต: ไฟล์เทสทุกชนิด (tests/**, *.test.ts, *.spec.ts, e2e/**) + tests/setup.ts
#
# carve-out เดียว: บรรทัดที่ "ขึ้นต้น" ด้วยคอมเมนต์ (//, *, /*) — คอมเมนต์รันไม่ได้
#   จึงไม่อันตราย และเอกสาร/คอมเมนต์ที่อธิบายกฎข้อนี้ต้องพิมพ์ชื่อคำสั่งที่ห้ามได้
#   (hook เวอร์ชันแรกไม่มี carve-out นี้แล้ว block คอมเมนต์ของตัวเอง)
#   โค้ดจริงที่มีคอมเมนต์ต่อท้าย เช่น `await x.deleteMany() // ล้างก่อน` ยังโดนจับ
#
# Hard Rule 13 เองไม่มีข้อยกเว้น: ต้องการล้างข้อมูลระหว่างเทส ให้ scope ด้วย where
# ที่ผูกกับข้อมูลที่เทสสร้างเอง (shopId/userId) — ดู deleteTestData() ใน tests/setup.ts
#
# exit 2 = block + feedback เด้งกลับ AI ให้แก้. exit 0 = ผ่าน.
# ============================================================================
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

# เฉพาะไฟล์เทส — ไฟล์ production code ไม่เกี่ยว (service จริงมี deleteMany ที่ scope อยู่แล้ว)
is_test=false
case "$file" in
  *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) is_test=true ;;
  */tests/*|*/e2e/*|*/__tests__/*)           is_test=true ;;
esac
$is_test || exit 0

violations=""
add() { violations="${violations}$1"$'\n'; }

# grep -nE แล้วตัด "บรรทัดที่เป็นคอมเมนต์" ออก — คอมเมนต์รันไม่ได้ จึงไม่อันตราย
# (จำเป็นจริง: เอกสาร/คอมเมนต์อธิบายกฎข้อนี้ต้องพิมพ์ชื่อคำสั่งที่ห้ามได้)
# ระวัง: ตัดเฉพาะบรรทัดที่ "ขึ้นต้น" ด้วย //, *, /* เท่านั้น — โค้ดจริงที่มีคอมเมนต์
# ต่อท้าย (`await x.deleteMany() // ล้างก่อน`) ยังโดนจับตามเดิม
scan_nocomment() {
  grep -nE "$1" "$file" 2>/dev/null | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' || true
}

# ── 1. deleteMany() / deleteMany({}) — ไม่มี where = ลบทั้งตาราง ──────────────
#    จับทั้ง `prisma.x.deleteMany()` และ `tx.x.deleteMany({})`
hits=$(scan_nocomment 'deleteMany\(\s*(\{\s*\})?\s*\)')
[ -n "$hits" ] && add "[HR13] deleteMany() ที่ไม่มี where = ลบทั้งตาราง ห้ามเด็ดขาดในไฟล์เทส:
$hits"

# ── 2. TRUNCATE ──────────────────────────────────────────────────────────────
hits=$(scan_nocomment 'TRUNCATE[[:space:]]+(TABLE[[:space:]]+)?')
[ -n "$hits" ] && add "[HR13] TRUNCATE ในไฟล์เทส — ลบทั้งตาราง ห้ามเด็ดขาด:
$hits"

# ── 3. DELETE FROM ที่ไม่มี WHERE (บรรทัดเดียวกัน) ────────────────────────────
hits=$(scan_nocomment 'DELETE[[:space:]]+FROM[[:space:]]+[^;]*' | grep -viE 'where' || true)
[ -n "$hits" ] && add "[HR13] DELETE FROM ที่ไม่มี WHERE ในไฟล์เทส:
$hits"

# ── 4. DROP / reset schema ───────────────────────────────────────────────────
hits=$(scan_nocomment 'DROP[[:space:]]+(TABLE|SCHEMA|DATABASE)|migrate[[:space:]]+reset|db[[:space:]]+push[[:space:]]+--force-reset')
[ -n "$hits" ] && add "[HR13] คำสั่งทำลาย schema ในไฟล์เทส:
$hits"

# ── 5. prisma db pull — ลบ EXCLUDE constraint ที่ introspection มองไม่เห็น ────
hits=$(scan_nocomment 'prisma[[:space:]]+db[[:space:]]+pull')
[ -n "$hits" ] && add "[HR13] prisma db pull ในไฟล์เทส — จะทับ schema.prisma และลบ EXCLUDE constraint ของ 00008/00017/00024:
$hits"

if [ -n "$violations" ]; then
  {
    echo "🛑 Test DB Guard — ละเมิด Hard Rule 13 ใน:"
    echo "   $file"
    echo
    printf '%s' "$violations"
    echo "ทำไมถึงห้าม: dev DB = prod DB ตัวเดียวกัน (Supabase แชร์) คำสั่งพวกนี้ลบข้อมูลจริงทั้งฐาน"
    echo "ทำแทนยังไง: scope ด้วย where ที่ผูกกับข้อมูลที่เทสสร้างเอง เช่น"
    echo "   await prisma.order.deleteMany({ where: { shopId: testShopId } })"
    echo "หรือทำเป็น unit test ที่ไม่แตะ DB เลย (วางใต้ src/**/__tests__/)"
    echo "ดู CLAUDE.md Hard Rule 13 + docs/conventions/test-db-safety.md"
  } >&2
  exit 2
fi

exit 0
