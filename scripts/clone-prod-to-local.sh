#!/usr/bin/env bash
#
# clone-prod-to-local — ก็อปฐาน prod ทั้งก้อนมาไว้บนฐาน local เพื่อทดสอบ
#
# ทิศทางเดียว: prod (อ่าน) → local (เขียน)
#
#   · อ่าน prod ด้วย `pg_dump` เท่านั้น — เป็นคำสั่งอ่านล้วน ไม่มีทางแก้ข้อมูลต้นทาง
#   · เขียนลงฐานที่ **ปักหมุด localhost ไว้ในไฟล์นี้** ไม่รับจาก env (Hard Rule 14)
#     ⇒ "restore ผิดที่" เป็นไปไม่ได้เชิงโครงสร้าง ไม่ใช่เพราะระวังตอนพิมพ์
#
# 🛑 ก่อนรัน รู้ไว้ 3 ข้อ
#
#   1. ข้อมูลนี้คือ **ลูกค้าจริงของทุกร้าน** (ชื่อ · เบอร์ · ที่อยู่ · บทสนทนา) จะถูกก็อป
#      มาไว้บนเครื่องนี้ — เก็บเครื่องดี ๆ และลบฐาน local ทิ้งเมื่อทดสอบเสร็จถ้าไม่ใช้ต่อ
#   2. ขั้นตอน restore จะ **ล้างฐาน local ทิ้งทั้งหมด** (ฐาน local เท่านั้น — prod ไม่ถูกแตะ)
#      ข้อมูลทดสอบที่ seed ไว้ก่อนหน้าจะหายไปด้วย · seed ใหม่ได้ด้วย `npm run db:local:seed`
#   3. หลัง restore ฐาน local จะมีสคีมาเท่ากับ prod ⇒ **ตาราง OrderPayment ของ feature 00050
#      จะหายไป** สคริปต์นี้จึงรัน `prisma migrate deploy` ต่อให้อัตโนมัติเป็นขั้นสุดท้าย
#
set -euo pipefail

cd "$(dirname "$0")/.."

# ── ปลายทาง: ปักหมุดในไฟล์ ห้ามรับจาก env ──────────────────────────────
LOCAL_URL="postgresql://safepay:safepay@localhost:5434/safepay"
# 🛑 ต้องเป็น container ที่ **เวอร์ชัน Postgres ไม่ต่ำกว่า prod**
#    prod = 17.6 · `pg_dump` 16 ปฏิเสธการดัมพ์ server 17 ตรง ๆ ("server version mismatch")
#    ตัวเก่า `deepweb-db` เป็น 16 จึงใช้ไม่ได้ — ยังอยู่ (แค่หยุด) กู้กลับได้ถ้าต้องการ
LOCAL_CONTAINER="deepweb-pg17"
LOCAL_DB="safepay"
LOCAL_USER="safepay"

case "$LOCAL_URL" in
  *@localhost:*|*@127.0.0.1:*) ;;
  *) echo "ปลายทางไม่ใช่ localhost — ปฏิเสธการรัน"; exit 1 ;;
esac

# ── ต้นทาง: อ่านจาก .env (ไม่พิมพ์ค่าออกจอ) ─────────────────────────────
PROD_URL="$(grep -m1 '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '"')"
if [ -z "$PROD_URL" ]; then echo "หา DIRECT_URL ใน .env ไม่เจอ"; exit 1; fi
case "$PROD_URL" in
  *localhost*|*127.0.0.1*) echo "DIRECT_URL ชี้ localhost — ไม่ใช่ prod ไม่ต้องก็อป"; exit 1 ;;
esac

if ! docker ps --format '{{.Names}}' | grep -qx "$LOCAL_CONTAINER"; then
  echo "ฐาน local ไม่ได้รัน — สั่ง: docker start $LOCAL_CONTAINER"
  exit 1
fi

# ── เวอร์ชันต้องเข้ากันได้ก่อนเริ่ม ไม่ใช่ไปรู้ตอนดัมพ์ล้มกลางทาง ──────────
CLIENT_MAJOR="$(docker exec "$LOCAL_CONTAINER" pg_dump --version | grep -oE '[0-9]+' | head -1)"
SERVER_MAJOR="$(docker exec -e SRC="$PROD_URL" "$LOCAL_CONTAINER" \
  sh -c 'psql "$SRC" -tAc "show server_version"' 2>/dev/null | grep -oE '^[0-9]+' || echo "")"
if [ -z "$SERVER_MAJOR" ]; then
  echo "ต่อ prod เพื่ออ่านเวอร์ชันไม่ได้ — เช็คเน็ต/สิทธิ์ก่อน (ยังไม่ได้แตะฐาน local)"
  exit 1
fi
if [ "$CLIENT_MAJOR" -lt "$SERVER_MAJOR" ]; then
  cat <<EOF
pg_dump ในคอนเทนเนอร์เป็นเวอร์ชัน $CLIENT_MAJOR แต่ prod เป็น $SERVER_MAJOR
pg_dump ปฏิเสธการดัมพ์ server ที่ใหม่กว่าตัวเอง (กันไฟล์ดัมพ์เสียหายเงียบ ๆ)

แก้: สร้างคอนเทนเนอร์ Postgres $SERVER_MAJOR ขึ้นมาแทนที่พอร์ต 5434

  docker stop $LOCAL_CONTAINER
  docker run -d --name deepweb-pg$SERVER_MAJOR \\
    -e POSTGRES_USER=safepay -e POSTGRES_PASSWORD=safepay -e POSTGRES_DB=safepay \\
    -p 5434:5432 -v deepweb_pg$SERVER_MAJOR:/var/lib/postgresql/data postgres:$SERVER_MAJOR-alpine

แล้วแก้ LOCAL_CONTAINER ในไฟล์นี้เป็น deepweb-pg$SERVER_MAJOR
EOF
  exit 1
fi
echo "เวอร์ชัน: prod = $SERVER_MAJOR · เครื่องมือฝั่ง local = $CLIENT_MAJOR (เข้ากันได้)"

echo "จะก็อป prod → local ($LOCAL_CONTAINER พอร์ต 5434)"
echo "ฐาน local ปัจจุบันจะถูกล้างทิ้งทั้งหมด"
read -r -p "พิมพ์ 'yes' เพื่อยืนยัน: " ok
[ "$ok" = "yes" ] || { echo "ยกเลิก"; exit 1; }

echo
echo "[1/3] ดึงดัมพ์จาก prod (อ่านอย่างเดียว)..."
# 🛑 ต้องห่อด้วย sh -c '…' และใช้ single quote — ให้ shell **ใน container** เป็นคนแปลง $SRC
#    ถ้าเขียน "$SRC" ลอย ๆ shell ของเครื่องจะแปลงก่อนถึง container แล้ว `set -u` ตายทันที
#    (ตัวแปรนั้นมีอยู่แค่ใน env ของ container ไม่ได้มีบนเครื่อง)
if ! docker exec -e SRC="$PROD_URL" "$LOCAL_CONTAINER" \
  sh -c 'pg_dump --no-owner --no-acl --clean --if-exists --schema=public "$SRC" -f /tmp/prod.sql'; then
  echo "  ดึงดัมพ์ไม่สำเร็จ — ยังไม่ได้แตะฐาน local เลย ปลอดภัยดี"
  exit 1
fi
docker exec "$LOCAL_CONTAINER" sh -c 'ls -lh /tmp/prod.sql' | awk '{print "      ขนาดดัมพ์: "$5}'

echo "[2/3] restore ลงฐาน local..."
# ON_ERROR_STOP=0 โดยตั้งใจ: ดัมพ์มี DROP ของอ็อบเจกต์ที่ฐานเปล่ายังไม่มี (error ที่ไม่เป็นไร)
# ความผิดพลาดจริงดูจาก log + ตัวเลขสรุปท้ายสคริปต์
docker exec "$LOCAL_CONTAINER" \
  psql -U "$LOCAL_USER" -d "$LOCAL_DB" -q -v ON_ERROR_STOP=0 -f /tmp/prod.sql \
  > /tmp/restore.log 2>&1 || true
echo "      เสร็จ — error ที่ข้ามไป $(grep -c '^ERROR' /tmp/restore.log || echo 0) บรรทัด (log: /tmp/restore.log)"
docker exec "$LOCAL_CONTAINER" rm -f /tmp/prod.sql

echo "[3/3] ลง migration ที่ยังไม่มีบน prod (เช่น OrderPayment ของ 00050)..."
DATABASE_URL="$LOCAL_URL" DIRECT_URL="$LOCAL_URL" npx prisma migrate deploy 2>&1 | tail -4

echo
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -tAc \
  "select '  ผู้ใช้ '||(select count(*) from \"User\")
        ||' · ร้าน '||(select count(*) from \"Shop\")
        ||' · ออเดอร์ '||(select count(*) from \"Order\")
        ||' · ตาราง OrderPayment '||(select case when to_regclass('public.\"OrderPayment\"') is null then 'ไม่มี' else 'พร้อม' end);"

cat <<'EOF'

เสร็จแล้ว — ฐาน local เป็นสำเนาของ prod + ตารางของ feature 00050

  🛑 ล็อกอินบนเครื่อง local ใช้ OTP ไม่ได้ถ้าเบอร์ไม่อยู่ใน TEST_ACCOUNTS
     (src/lib/otp.ts — dev เท่านั้น: 0000000001..0000000006, 0000000009 รหัส 123456)
     เปลี่ยนเบอร์เจ้าของร้านที่จะทดสอบให้เป็นเบอร์ทดสอบก่อน เช่น

       docker exec deepweb-pg17 psql -U safepay -d safepay -c \
         "UPDATE \"User\" SET phone='0000000005' WHERE id='<userId ของเจ้าของร้าน>';"

  จากนั้น:  npm run dev:local
EOF
