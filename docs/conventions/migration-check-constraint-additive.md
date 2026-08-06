# Migration ที่แก้ CHECK constraint แบบรายชื่อ ต้องเป็น additive

> ที่มา: `docs/retro/2026-08-06-feature-00033-backdated-order-date-retrospective.md` §P-2
> เคสจริง 2026-08-06 — ค่า `ORDER_DATE_CHANGED` ถูกลบทิ้งจากฐาน dev ทั้งที่ migration รันสำเร็จครบ

## ปัญหา

โปรเจกต์นี้ใช้ **String + DB CHECK** แทน Prisma enum (เหตุผลอยู่ใน `schema.prisma` ที่ `OrderEvent.type` และ `Shop.vertical`) การเพิ่มค่าใหม่จึงต้องเขียน migration เอง และ pattern ที่ทุกไฟล์ก่อนหน้าใช้คือ:

```sql
ALTER TABLE "X" DROP CONSTRAINT "X_type_check";
ALTER TABLE "X" ADD CONSTRAINT "X_type_check" CHECK ("type" IN ( ...รายชื่อเต็มที่ตัวเองรู้จัก... ));
```

pattern นี้ **ปลอดภัยเมื่อมีคนเดียวแก้** และ **พังทันทีเมื่อมีสอง branch แก้พร้อมกัน**

เกิดขึ้นจริง 2026-08-06: `20260806120000_order_event_date_changed` (branch วันที่ย้อนหลัง) ชนกับ `20260806120000_order_shipment_cod_settled` (branch iShip) **timestamp เท่ากันเป๊ะ** แล้วมี `20260806140000_order_event_payment_synced` ตามมาอีก — ทั้งสามต่างก็ `DROP` แล้ว `ADD` ด้วยรายชื่อของตัวเอง ผลคือ **ตัวที่รันทีหลังลบค่าของตัวที่รันก่อนทิ้ง**

อาการของมันคือสิ่งที่แย่ที่สุด:
- migration รายงานว่า **สำเร็จทุกไฟล์** · `_prisma_migrations` มีครบ · `migrate status` บอก "up to date"
- ไม่มี error ไม่มี warning ไม่มี type error
- ไปโผล่เป็น **insert ล้มตอน runtime บนฐานจริง** ในวันที่มีคนใช้ค่านั้นเป็นครั้งแรก

## กฎ

### 1. ห้าม hardcode รายชื่อ — อ่านของเดิมมาต่อท้าย

```sql
DO $$
DECLARE
  def  text;
  vals text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'OrderEvent_type_check'
    AND conrelid = '"OrderEvent"'::regclass;   -- scope ด้วย table เสมอ กันชื่อซ้ำข้าม schema

  IF def IS NULL THEN
    -- ฐานที่ยังไม่มี constraint — ใส่รายชื่อของ branch นี้ไปก่อน ตัวที่มาทีหลังจะต่อท้ายเอง
    ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" IN (
      'ORDER_CREATED', 'ORDER_EDITED', 'ORDER_DATE_CHANGED'   -- ...
    )) NOT VALID;
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";

  ELSIF position('ORDER_DATE_CHANGED' IN def) = 0 THEN
    SELECT string_agg(quote_literal(m[1]), ', ')
    INTO vals
    FROM regexp_matches(def, '''([A-Za-z0-9_]+)''', 'g') AS m;

    -- ล้มเสียงดังดีกว่าลบค่าเงียบ ๆ: ถ้าดึงค่าได้ไม่ครบเท่าจำนวน quote ในนิยามเดิม แปลว่ามีค่า
    -- ที่ regex ไม่รู้จัก (เช่นมีอักขระนอก [A-Za-z0-9_]) — หยุดทันที อย่าเขียนทับ
    IF vals IS NULL OR (length(def) - length(replace(def, '''', ''))) / 2 <> array_length(string_to_array(vals, ', '), 1) THEN
      RAISE EXCEPTION 'ดึงรายชื่อค่าเดิมจาก CHECK ไม่ครบ — หยุดก่อนเขียนทับ (def: %)', def;
    END IF;

    ALTER TABLE "OrderEvent" DROP CONSTRAINT "OrderEvent_type_check";
    EXECUTE format(
      'ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" = ANY (ARRAY[%s, ''ORDER_DATE_CHANGED'']::text[])) NOT VALID',
      vals
    );
    ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
  END IF;
  -- มีค่าอยู่แล้ว = ไม่ทำอะไร (idempotent)
END $$;
```

**คุณสมบัติที่ต้องมีครบ:** อ่านของเดิม · ต่อท้าย · scope ด้วย `conrelid` · idempotent · `NOT VALID` + `VALIDATE` (ตารางมีข้อมูลแล้ว) · **ล้มเสียงดังเมื่อ parse ไม่ครบ**

### 2. เช็ค timestamp ชนก่อนตั้งชื่อโฟลเดอร์เสมอ

```bash
git log --all --name-only --pretty=format: -- 'prisma/migrations/*' \
  | grep -oE '20260806[0-9]{6}_[a-z_]+' | sort -u
```

`ls prisma/migrations/` บน branch ปัจจุบัน **มองไม่เห็น migration ของ branch ที่ยังไม่ merge** — ต้องดูทุก branch เหมือนกับกฎการจองเลข feature (`feedback_feature_number_collision`)

ชนแล้วให้เลื่อน timestamp ของตัวเอง **ไปหลัง** ไม่ใช่ไปก่อน — ตัวที่รันทีหลังคือตัวที่ได้เห็นค่าของทุกคน

### 3. ห้าม `prisma db pull` / `migrate dev` กับตารางที่มี CHECK แบบนี้

CHECK เหล่านี้เป็น **unmanaged SQL** ที่ Prisma DSL ประกาศไม่ได้ — introspect ไม่เห็น แล้วจะสร้าง migration ที่ DROP ทิ้ง (ดู Hard Rule 14)

## ตารางที่อยู่ใต้กฎนี้ตอนนี้

| ตาราง | constraint | จำนวนค่า (2026-08-06) |
|---|---|---|
| `OrderEvent` | `OrderEvent_type_check` | 13 |
| `Shop` | `Shop_vertical_check` | 3 |

## วิธียืนยันหลัง apply

```bash
PGPASSWORD=... psql -h localhost -p 5434 -U safepay -d safepay -tAc \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='OrderEvent_type_check';"
```

**อย่าเชื่อว่า `migrate deploy` สำเร็จ = ค่าอยู่ครบ** — ในเคสจริงมันสำเร็จทุกไฟล์แล้วค่าหาย
