#!/usr/bin/env bash
# ============================================================================
# Prod DB Guard — harness-enforced (SafePay/Deep) — Hard Rule 14
# ----------------------------------------------------------------------------
# ทำไมถึงมี: 2026-07-31 22:37 น. ฐาน Supabase ถูกล้างทั้งฐาน (64 ตาราง drop +
# สร้างใหม่ ข้อมูลลูกค้าหายหมด) ด้วยคำสั่งนี้ใน worktree feature-auto-reply
#
#   npx dotenv -e .env.local -- npx prisma migrate diff \
#     --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations \
#     --shadow-database-url "$(grep -m1 DIRECT_URL .env.local | cut -d= -f2- | tr -d '"')"
#
# shadow database คือ "ฐานทิ้งขว้าง" ที่ Prisma drop schema แล้ว replay migration
# ใหม่ทั้งชุดเพื่อคำนวณ diff — พอเอา URL ของ prod ไปใส่ Prisma ก็ทำแบบนั้นกับ prod
# ตามที่มันถูกออกแบบมา. คำสั่งไม่มีคำว่า delete/drop/reset สักคำ hook เดิม
# (test-db-guard) จึงมองไม่เห็น เพราะมันตรวจแค่ "ไฟล์เทสตอนถูกเขียน"
#
# hook นี้ตรวจที่ "ตอนจะรันคำสั่ง" (PreToolUse บน Bash) — ครอบทุกเส้นทางที่ทำลาย
# ฐานได้ ไม่ใช่แค่ไฟล์เทส
#
# หลักการ: allowlist / fail-closed เหมือน tests/setup.ts — คำสั่งที่ล้างฐานได้
# ต้อง "พิสูจน์ได้จากตัวคำสั่งเอง" ว่าเป้าหมายคือ Postgres บนเครื่องตัวเอง
# อะไรที่พิสูจน์ไม่ได้ (command substitution, ตัวแปร, host ปลายทางอื่น) = บล็อก
# เหตุผล: เดิม dev DB = prod DB ตัวเดียวกัน (Supabase แชร์) — **แยกกันแล้วตั้งแต่ 2026-08**
# (ยืนยัน 2026-08-16: .env/.env.local ชี้ localhost:5434 ทั้ง DATABASE_URL และ DIRECT_URL)
# guard ยังอยู่เพราะการแยกเป็น "ค่า config" ที่ย้อนกลับเงียบ ๆ ได้ — pull env จาก Vercel,
# แก้ .env ผิดบรรทัด, หรือ worktree ที่ถือไฟล์เก่า — และเหตุ 07-31 มาทาง DIRECT_URL
# ไม่ใช่ DATABASE_URL ⇒ guard ไม่มีต้นทุนตอนที่ไม่มีอะไรผิด เดาผิดครั้งเดียว = ข้อมูลหาย
#
# วิธีเลี่ยงเมื่อจำเป็นจริง: ปักหมุด URL localhost ไว้ในคำสั่งตรง ๆ เช่น
#   DATABASE_URL="postgresql://safepay:safepay@localhost:5544/safepay" npx prisma migrate dev
#   --shadow-database-url "postgresql://safepay:safepay@localhost:5544/shadow"
#
# exit 2 = block + feedback เด้งกลับ AI. exit 0 = ผ่าน.
# ============================================================================
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0

# ── scope: เฉพาะงานที่เกี่ยวกับ SafePay/Deep ─────────────────────────────────
# สคริปต์ตัวนี้ถูกติดตั้ง 2 ที่: ในรีโปนี้ (committed) และที่ ~/.claude/hooks/ ที่
# ลงทะเบียนระดับ user — ตัวหลังมีไว้ครอบ worktree ที่ยังไม่ได้ merge commit นี้
# (ตอนเกิดเหตุมี 9 worktree รันพร้อมกัน) ผลข้างเคียงคือมันจะเห็นคำสั่งของ
# โปรเจกต์อื่นด้วย — กฎอย่าง "ห้าม migrate dev/db pull" เป็นกฎเฉพาะโปรเจกต์นี้
# (dev DB = prod DB) จึงต้องไม่ไปบังคับใช้กับที่อื่น
case "$PWD $cmd" in
  *safepay*|*deepthailand*|*deepth.local*) ;;
  *) exit 0 ;;
esac

# รวมเป็นบรรทัดเดียว — คำสั่งหลายบรรทัด (heredoc, &&) ต้องตรวจได้เหมือนกัน
raw=$(printf '%s' "$cmd" | tr '\n' ' ')

# ── carve-out: heredoc ที่เป็น "ข้อมูล" ไม่ใช่ "คำสั่ง" ───────────────────────
# `git commit -F - <<EOF ... EOF` / `cat > doc.md <<EOF ... EOF` — เนื้อในคือข้อความ
# ที่ถูกส่งต่อ ไม่ได้ถูกรัน. commit message และเอกสารที่อธิบายกฎข้อนี้ "ต้องพิมพ์ชื่อ
# คำสั่งที่ห้ามได้" (guard เวอร์ชันแรกบล็อก commit ของตัวเองเพราะข้อนี้)
#
# แต่ถ้า heredoc ถูกป้อนให้ shell/interpreter (`bash <<EOF`, `psql <<SQL`) เนื้อใน
# = โค้ดที่รันจริง ห้ามตัดทิ้งเด็ดขาด ไม่งั้นกลายเป็นช่องหลบ guard
if ! printf '%s' "$raw" | grep -qE '(^|[;&|]|[[:space:]])(bash|sh|zsh|psql|pgcli|node|python3?|tsx)([[:space:]][^<]*)?<<'; then
  stripped=$(printf '%s' "$raw" | perl -0pe "s/<<-?\s*['\"]?(\w+)['\"]?.*?\s\\1(\s|\$)/ \[heredoc\] /gs" 2>/dev/null) \
    && [ -n "$stripped" ] && raw="$stripped"
fi

# `code` = คำสั่งที่ตัด "ข้อความในเครื่องหมายคำพูด" ออก ใช้ตัดสินว่าอะไรคือ
# การ "เรียกคำสั่งจริง" ไม่ใช่แค่ string ที่ถูกส่งให้ grep/echo
# (ไม่งั้น `grep "migrate reset" file` จะโดนบล็อกทั้งที่อ่านอย่างเดียว)
code=$(printf '%s' "$raw" | sed -e "s/'[^']*'/''/g" -e 's/"[^"]*"/""/g')

# ...ยกเว้นเมื่อมี exec wrapper: `bash -c "..."`, `os.system('...')`, eval/exec
# พวกนี้ "ข้อความในเครื่องหมายคำพูดคือคำสั่งที่รันจริง" การตัด quote ออกจะกลายเป็น
# ช่องหลบ จึงต้องเอา raw กลับเข้ามาตรวจด้วย
if printf '%s' "$raw" | grep -qE '(bash|sh|zsh|ssh)[[:space:]]+-c|os\.system|subprocess|[[:space:]](eval|exec)[[:space:]]'; then
  code="$code $raw"
fi

# ── กาง npm/pnpm/yarn run <script> ออกเป็นคำสั่งจริง ────────────────────────
# guard ตัวนี้ตรวจ "ข้อความของคำสั่ง" — พอคำสั่งอันตรายถูกห่อไว้ใน npm script ชื่อของมัน
# จะหายไปหมด: `npm run migrate` ไม่มีคำว่า prisma หรือ migrate dev สักคำ ทั้งที่กางออกมา
# คือ `dotenv -e .env -- npx prisma migrate dev` (เจอ 2026-08-01 ตอน scan — guard เดิม
# คืน exit=0 ให้คำสั่งที่ reset ฐานได้)
#
# **ต้องอยู่หลัง `code` ถูกคำนวณเสร็จ** และค้นชื่อ script จาก `$code` ไม่ใช่ `$raw`:
# ถ้าค้นจาก raw จะไปกางชื่อที่อยู่ในเครื่องหมายคำพูดด้วย — `grep "npm run e2e" file`
# ที่แค่อ่านไฟล์จะถูกกางเป็น `playwright test` แล้วโดนบล็อก ทำลาย carve-out เดิมทั้งอัน
# (เกิดจริงตอนทดสอบแพตช์นี้: guard บล็อกสคริปต์ที่ใช้ทดสอบตัวมันเอง)
#
# 2 รอบ เพราะ script เรียก script ต่อกันได้อีกชั้น. หา package.json ไม่เจอ = กางไม่ได้
# แต่ pattern เดิมยังตรวจตามปกติ (ไม่ได้เปิดช่องใหม่ แค่ไม่ได้ข้อมูลเพิ่ม)
pkg="${CLAUDE_PROJECT_DIR:-$PWD}/package.json"
[ -f "$pkg" ] || pkg="$PWD/package.json"
if [ -f "$pkg" ]; then
  for _pass in 1 2; do
    expanded=""
    for name in $(printf '%s' "$code" \
        | grep -oE '(npm|pnpm|yarn)[[:space:]]+(run[[:space:]]+)?[A-Za-z0-9:_-]+' \
        | awk '{print $NF}'); do
      body=$(jq -r --arg n "$name" '.scripts[$n] // empty' "$pkg" 2>/dev/null)
      [ -n "$body" ] && expanded="${expanded} ${body}"
    done
    [ -z "$expanded" ] && break
    case "$code" in *"$expanded"*) break ;; esac   # กางซ้ำของเดิม = พอแล้ว
    # ต่อเข้าทั้งสองตัว: `code` สำหรับ pattern คำสั่ง, `raw` สำหรับ has_local_pin/ค่า URL
    code="${code} ${expanded}"
    raw="${raw} ${expanded}"
  done
fi

violations=""
add() { violations="${violations}$1"$'\n'; }

# ── ตัวช่วย: URL นี้ชี้ Postgres บนเครื่องตัวเองไหม ────────────────────────────
# allowlist: อะไรที่ไม่ได้ระบุว่าปลอดภัย ถือว่าอันตรายไว้ก่อน
is_local_url() {
  printf '%s' "$1" \
    | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' \
    | grep -qE '^postgres(ql)?://([^@/]*@)?(localhost|127\.0\.0\.1|\[?::1\]?|host\.docker\.internal)([:/]|$)'
}

# คำสั่งปักหมุดปลายทางเป็น localhost ไว้ตรง ๆ ครบทุกตัวแปรไหม
#
# ต้องครบ *ทั้ง* DATABASE_URL และ DIRECT_URL — prisma/schema.prisma ประกาศ
#   url = env("DATABASE_URL")   directUrl = env("DIRECT_URL")
# และงาน migration ทุกชนิด (migrate reset/dev/deploy, db push) วิ่งผ่าน **directUrl**
# ไม่ใช่ url. ของเดิมยอมรับตัวใดตัวหนึ่ง → ปักหมุดตัวที่ Prisma ไม่ได้ใช้ก็ผ่าน guard
# แล้ว DIRECT_URL ก็หลุดมาจาก .env.local ตามเดิม:
#
#   DATABASE_URL=postgresql://a@localhost:5434/x npx dotenv -e .env.local -- \
#     npx prisma migrate reset          ← guard เดิมคืน exit=0
#
# เป็นรูปเดียวกับเหตุ 2026-07-31 เป๊ะ: ตัวแปรที่ "ลืมตรวจ" คือตัวที่พาไปหาฐานผิด
has_local_pin() {
  local var v found_any pinned
  for var in DATABASE_URL DIRECT_URL; do
    found_any=false
    pinned=false
    for v in $(printf '%s' "$raw" | grep -oE "(^|[[:space:]])${var}=[^[:space:]]+" | cut -d= -f2-); do
      found_any=true
      is_local_url "$v" && pinned=true
    done
    # ไม่ได้ปักหมุดเลย = ค่าจะมาจาก .env ที่ guard มองไม่เห็น = พิสูจน์ไม่ได้ = ไม่ผ่าน
    $found_any || return 1
    $pinned || return 1
  done
  return 0
}

# ── 1. shadow database — ต้นเหตุของเหตุการณ์ 2026-07-31 ──────────────────────
# ตรวจก็ต่อเมื่อ flag โผล่ "นอกเครื่องหมายคำพูด" (= ตั้งใจรันจริง)
if printf '%s' "$code" | grep -qiE '\-\-shadow-database-url|SHADOW_DATABASE_URL='; then
  bad=""
  # ดึงค่าจาก raw (ค่ามักถูก quote ไว้) — ค่าที่มีช่องว่างจะถูกตัดสั้น ซึ่งทำให้
  # "ตัดสินเข้มขึ้น" เท่านั้น ไม่มีทางทำให้หลุดเป็นผ่าน
  for v in $(printf '%s' "$raw" \
      | grep -oiE '(\-\-shadow-database-url[[:space:]=]+|SHADOW_DATABASE_URL=)[^[:space:]]+' \
      | sed -E 's/^[^=[:space:]]*[[:space:]=]+//; s/^SHADOW_DATABASE_URL=//I'); do
    is_local_url "$v" || bad="${bad}    ค่าที่ให้มา: ${v}"$'\n'
  done
  # flag โผล่แต่ดึงค่าไม่ได้เลย (เช่นค่าอยู่ใน $(...) ที่มีช่องว่าง) = พิสูจน์ไม่ได้ = บล็อก
  if [ -z "$bad" ] && ! printf '%s' "$raw" | grep -oiE '(\-\-shadow-database-url[[:space:]=]+|SHADOW_DATABASE_URL=)[^[:space:]]+' >/dev/null; then
    bad="    (ดึงค่าไม่ได้ — พิสูจน์ไม่ได้ว่าไม่ใช่ prod)"$'\n'
  fi
  [ -n "$bad" ] && add "[HR14] --shadow-database-url ชี้ไปที่ฐานที่ไม่ใช่ localhost
$bad    shadow database ถูก Prisma drop ทั้ง schema แล้วสร้างใหม่เสมอ —
    ชี้ไป prod = ล้างข้อมูลลูกค้าทั้งฐาน (เกิดขึ้นจริงแล้ว 2026-07-31 22:37 น.)"
fi

# ── 2. คำสั่ง Prisma ที่ reset/ทับ schema ────────────────────────────────────
if printf '%s' "$code" | grep -qE '(^|[;&|(]|[[:space:]])prisma[[:space:]]+migrate[[:space:]]+reset'; then
  has_local_pin || add "[HR14] prisma migrate reset — drop ทั้ง schema แล้ว replay migration ใหม่"
fi

if printf '%s' "$code" | grep -qE '(^|[;&|(]|[[:space:]])prisma[[:space:]]+db[[:space:]]+push' \
   && printf '%s' "$code" | grep -qE '\-\-force-reset|\-\-accept-data-loss'; then
  has_local_pin || add "[HR14] prisma db push --force-reset/--accept-data-loss — ล้างข้อมูลเพื่อให้ schema ตรง"
fi

# migrate dev: ถ้าเจอ drift จะเสนอ reset ทั้งฐาน — บน DB ที่แชร์กับ prod ห้ามเด็ดขาด
# (ดู memory project_shared_db_drift_no_migrate_dev — ใช้ migrate deploy แทน)
if printf '%s' "$code" | grep -qE '(^|[;&|(]|[[:space:]])prisma[[:space:]]+migrate[[:space:]]+dev'; then
  has_local_pin || add "[HR14] prisma migrate dev — เจอ drift เมื่อไหร่จะ reset ทั้งฐาน ใช้ 'migrate deploy' แทน"
fi

# db pull: ทับ schema.prisma และลบ EXCLUDE/partial-unique ที่เป็น unmanaged SQL
if printf '%s' "$code" | grep -qE '(^|[;&|(]|[[:space:]])prisma[[:space:]]+db[[:space:]]+pull'; then
  add "[HR14] prisma db pull — ทับ schema.prisma และลบ constraint ที่ introspection มองไม่เห็น
    (EXCLUDE/partial unique ของ feat 00008/00017/00024)"
fi

if printf '%s' "$code" | grep -qE 'supabase[[:space:]]+db[[:space:]]+reset'; then
  has_local_pin || add "[HR14] supabase db reset — ล้างฐานทั้งลูก"
fi

# ── 3. SQL ทำลายล้างที่ยิงตรงผ่าน client ─────────────────────────────────────
# ดูจาก raw เพราะ SQL มักอยู่ในเครื่องหมายคำพูด (psql -c "TRUNCATE ...")
if printf '%s' "$code" | grep -qE '(^|[;&|(]|[[:space:]])(psql|pgcli)[[:space:]]'; then
  if printf '%s' "$raw" | grep -qiE 'DROP[[:space:]]+(TABLE|SCHEMA|DATABASE)|TRUNCATE[[:space:]]+(TABLE[[:space:]]+)?[A-Za-z_"]'; then
    has_local_pin || add "[HR14] psql ที่มี DROP TABLE/SCHEMA/DATABASE หรือ TRUNCATE บนฐานที่ไม่ใช่ localhost"
  fi
  if printf '%s' "$raw" | grep -qiE 'DELETE[[:space:]]+FROM[[:space:]]+[^;]*' \
     && ! printf '%s' "$raw" | grep -qiE 'DELETE[[:space:]]+FROM[[:space:]]+[^;]*WHERE'; then
    has_local_pin || add "[HR14] psql ที่มี DELETE FROM แบบไม่มี WHERE บนฐานที่ไม่ใช่ localhost"
  fi
fi

# ── 4. E2E — playwright ชี้ .env.local (= prod) และ helper ลบ User/Shop จริง ──
# e2e/helpers/auth.ts cleanup() ลบ user+shop+product, cleanupTestPhone() ลบ
# "ทุก user ที่ถือเบอร์นั้น" — บน prod = ลบบัญชีลูกค้าจริง
if printf '%s' "$code" | grep -qE '(playwright[[:space:]]+test|npm[[:space:]]+run[[:space:]]+e2e|pnpm[[:space:]]+e2e|yarn[[:space:]]+e2e)'; then
  has_local_pin || add "[HR14] E2E รันโดยไม่ปักหมุด DATABASE_URL เป็น localhost
    playwright.config.ts โหลด .env.local ซึ่งชี้ Supabase prod และ e2e/helpers/auth.ts
    ลบ User/Shop/Product จริง — เคยสร้างข้อมูลลงฐาน prod มาแล้ว (qarsv_* 2026-07-31)"
fi

if [ -n "$violations" ]; then
  {
    echo "🛑 Prod DB Guard — คำสั่งนี้ทำลายฐานข้อมูลที่ใช้ร่วมกับ prod ได้"
    echo
    printf '%s' "$violations"
    echo "บริบท: ฐาน dev แยกจาก prod แล้ว (localhost:5434) แต่การแยกเป็นค่า config ที่ย้อนกลับเงียบ ๆ ได้"
    echo "เคยเกิดแล้ว: 2026-07-31 22:37 น. ฐานถูกล้างทั้ง 64 ตารางด้วย --shadow-database-url ที่ชี้ prod"
    echo
    echo "ถ้าตั้งใจทำกับ Postgres บนเครื่องตัวเอง ให้ปักหมุด URL ในคำสั่งตรง ๆ"
    echo "**ทั้งสองตัว** — Prisma ใช้ DIRECT_URL สำหรับงาน migration ไม่ใช่ DATABASE_URL:"
    echo "   DATABASE_URL=\"postgresql://safepay:safepay@localhost:5544/safepay\" \\"
    echo "   DIRECT_URL=\"postgresql://safepay:safepay@localhost:5544/safepay\" <คำสั่ง>"
    echo "ห้ามใช้ \$(...) หรือตัวแปรอ่านจาก .env.local — guard พิสูจน์ไม่ได้ จึงถือว่าเป็น prod"
    echo
    echo "ดู CLAUDE.md Hard Rule 14 + docs/conventions/prod-db-safety.md"
  } >&2
  exit 2
fi

exit 0
