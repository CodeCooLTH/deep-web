# บันทึกส่งต่อ — ตัวกรอง "สถานะพัสดุ" ในหน้า /orders (+ ทางเข้าฝั่งเดสก์ท็อป)

**วันที่:** 2026-08-04
**เหตุที่ส่งต่อ:** ปิด session · งานนี้เป็น carry ข้อ 7 ของ `docs/retro/2026-08-04-chat-longpress-command-center-retrospective.md` แต่**ขอบเขตกว้างกว่าที่เขียนไว้ในเรโทร** (เพิ่งพบตอนตอบคำถาม user ก่อนปิด session)
**Branch:** `main` · **Worktree:** `/Users/craftman/orca/workspaces/safepay/main-2`

---

## ปัญหาที่ต้องแก้

ตัวกรอง "สถานะพัสดุ" (รอเลขพัสดุ / รอรับเข้า / กำลังจัดส่ง / พัสดุมีปัญหา) **มีทางเข้าเดียวคือไทล์บน
Command Center ซึ่งเป็น `lg:hidden` = มือถืออย่างเดียว**

ผลคือ:

| ใช้บนอะไร | ตอนนี้ทำได้ไหม |
|---|---|
| มือถือ | ได้ — กดไทล์บนหน้าแรก |
| เดสก์ท็อป (≥1024px) | **ไม่ได้เลย** ต้องพิมพ์ `/orders?stage=XXX` เอง |
| ในหน้า `/orders` เอง (ทุกจอ) | **ไม่ได้** — ไม่มีชิปให้กด มีแต่แถบบอกว่ากำลังกรองอะไรอยู่ + ปุ่ม "ดูทั้งหมด" |

หลักฐาน:
- `dashboard/page.tsx:376` — `<div className="lg:hidden">` ครอบ `<CommandCenter />` ทั้งก้อน
- `dashboard/page.tsx:414` — เดสก์ท็อปเป็น markup อีกชุด (`hidden lg:block`) ที่ **ไม่มีไทล์สถานะพัสดุ**
- `OrderStatusRow.tsx` — เวอร์ชันเดสก์ท็อปที่เขียนไว้ **ไม่มีใครเรียกเลย (dead code)** และเป็นชุด
  4 สถานะการขายแบบเก่า (PENDING/SHIPPED/CONFIRMED/CANCELLED) ไม่ใช่สถานะพัสดุ

---

## ของที่มีอยู่แล้ว — อย่าทำซ้ำ

| ของ | อยู่ที่ |
|---|---|
| **นิยาม 4 กอง (SSOT)** | `deriveShippingStage()` + `SHIPPING_STAGE_LABEL` — `src/lib/order-stage.ts` |
| stage ต่อแถว | `OrderRow.shippingStage` คำนวณที่ `orders/page.tsx` (เฉพาะร้าน `vertical === 'ONLINE_SALES'`) |
| อ่าน `?stage=` + กรอง + แถบแจ้ง + ปุ่มล้าง | `orders/components/OrdersList.tsx` |
| ชิปที่ต้องลอกสไตล์ | `STATUS_TABS` + แถว `overflow-x-auto` ในไฟล์เดียวกัน |
| ไทล์บน Command Center | `dashboard/components/OrderStatusBand.tsx` — **รับ prop `shipping` อยู่แล้ว** |
| ตัวนับฝั่ง server | `getShippingStageCounts()` — `src/services/order.service.ts` |

---

## สิ่งที่ต้องทำ

### 1. ชิปตัวกรองสถานะพัสดุในหน้า `/orders` (ทุก breakpoint)

- แถวชิปแยกจากแถว `STATUS_TABS` เดิม — **`?stage=` กับ `?status=` เป็นคนละแกน ใช้พร้อมกันได้**
  ห้ามให้ชิปใหม่ไปทับ/ล้างชิปเดิม
- **นับจำนวนบนชิปจาก `orders` array ที่หน้านั้นมีอยู่แล้ว** (หน้านี้ดึงออเดอร์ทั้งร้านมาอยู่แล้ว)
  🛑 ห้ามยิง endpoint นับใหม่ / ห้ามเขียนเงื่อนไขนับซ้ำ — ไม่งั้นเลขบนชิปกับรายการที่กรองได้จะไม่ตรงกัน
  ซึ่งเป็นบั๊กที่โปรเจกต์นี้เจอมาแล้ว 2 รอบ (ดู `docs/conventions/sibling-surface-parity.md`
  §"ตัวเลขต้องมาจาก symbol เดียว")
- ร้านที่ไม่ใช่ `ONLINE_SALES` **ไม่เห็นชิปแถวนี้เลย** (`shippingStage` เป็น `undefined` ทุกแถว)
- มีชิปแล้ว พิจารณาว่าแถบ "กำลังดูเฉพาะ…" ยังจำเป็นไหม (อาจซ้ำซ้อน — แต่ปุ่มล้างยังต้องมีทาง)

### 2. ตัดสินใจเรื่องทางเข้าฝั่งเดสก์ท็อป — **ถาม user ก่อนลงมือ**

คำถามที่ต้องเคาะ: dashboard ฝั่งเดสก์ท็อปควรมีไทล์สถานะพัสดุด้วยไหม?

- ถ้า **ใช่** → ใช้ `OrderStatusBand` ตัวเดิม (รับ prop `shipping` อยู่แล้ว) ไปวางใน block
  `hidden lg:block` **ห้ามปลุก `OrderStatusRow.tsx`** ซึ่งเป็น dead code ชุดสถานะการขายแบบเก่า
  (ถ้าไม่ใช้ ควรลบทิ้งไปเลยในรอบนี้)
- ถ้า **ไม่** → ชิปในหน้า `/orders` ก็เพียงพอ แต่ต้องบอก user ว่าเดสก์ท็อปจะไม่มีตัวเลขสรุปบนหน้าแรก

---

## กติกาที่ต้องเคารพ

1. **SSOT เดียว** — ทั้งไทล์ ทั้งชิป ทั้งตัวกรอง ต้องผ่าน `deriveShippingStage()` ตัวเดียว
   ห้ามนับด้วย SQL แยกแล้วกรองด้วย TS (เคยเกือบพลาดมาแล้ว แก้ที่ `df569b7f`)
2. **HR7** — `(paces)` ห้าม arbitrary value; ลอก class จาก `STATUS_TABS` ที่มีอยู่
3. **HR8** — งาน frontend ต้องผ่าน `safepay-ux` ก่อน · ถ้า user บอกว่า "ไม่ต้องเรียก agent" ก็ข้ามได้
   (session 2026-08-04 ทำแบบนั้นทั้งวันตามที่ user สั่ง)
4. **แก้ไฟล์ด้วย python/perl ไม่ trigger PostToolUse hook** → ต้อง grep HR7/HR12 เองก่อน commit
5. **มีอีก session ทำงานบนรีโปเดียวกันตลอด** — `git fetch` → เช็คว่าคอมมิตใหม่แตะไฟล์เดียวกันไหม →
   rebase → `tsc` + `npm run build` **ใหม่หลัง rebase** → push (2026-08-04 rebase ไป 9 รอบ)

---

## หมายเหตุสภาพแวดล้อม

เวิร์กทรีนี้ **ไม่มี `.env.local`** → รัน dev server เองไม่ได้ · build ต้องยิง env จำลอง:

```bash
env NEXTAUTH_SECRET='build-only-dummy-secret-0000000000000000' \
    NEXTAUTH_URL='http://localhost:4000' \
    DATABASE_URL='postgresql://postgres:postgres@localhost:5434/safepay?schema=public' \
    DIRECT_URL='postgresql://postgres:postgres@localhost:5434/safepay?schema=public' \
    CHANNEL_TOKEN_KEY='0000000000000000000000000000000000000000000000000000000000000000' \
    npm run build
```

ถ้าอยากรัน dev + browser QA จริง: `ln -s ~/Projects/safepay/.env.local .env.local`
(worktree `feature-auto-reply` ทำแบบนี้อยู่แล้ว) — แต่รอบที่ผ่านมา user เลือกกดทดสอบเองบน prod

`tsc` ใช้ `/opt/homebrew/bin/node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`

---

## ค้างอีกข้อ (ไม่เกี่ยวกับงานนี้)

ปุ่ม "ทักแชท" ในแท็บความคิดเห็นยังเป็นป้ายบอกเวลาถอยหลัง 7 วัน **ไม่ใช่ปุ่มกดได้** — ต้องทำ
Private Replies ของ Meta ฝั่ง backend ก่อน (`CommentsClient.tsx` — ดูคอมเมนต์ที่บล็อก `chatWindow`)
