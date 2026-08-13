<!-- Feature 00048 - Customer File Library -->

---
title: "TestCase — คลังไฟล์ต่อลูกค้า"
owner: shinobu22
status: draft
created: 2026-08-13
tags: [test, qa, feature, 00048]
related: ["[[BRD]]", "[[SRS]]", "[[SDS]]", "[[API]]"]
---

# TestCase: คลังไฟล์ต่อลูกค้า (00048)

> 🛑 **ประโยค "ยังไม่มีวิธี repro" ในเอกสารนี้แปลว่า "ไม่เคยทดสอบ" ไม่ใช่หมายเหตุ**
> (`docs/conventions/rule-must-be-enforced-not-described.md`)
> ทุกเคส `[blocker]` ต้องพิสูจน์ด้วย **mutation** — คืนตรรกะผิดกลับไปแล้วต้องแดง ไม่ใช่แค่เขียนให้เขียว

---

## 1. Unit tests — `src/lib/__tests__/customer-file-library.test.ts`

| ID | เคส | คาดหวัง | mutation ที่ต้องทำให้แดง |
|---|---|---|---|
| TC-01 `[blocker]` | `isLibraryEligible` กับ IMAGE ปกติ | `true` | — |
| TC-02 `[blocker]` | IMAGE ที่ `isSticker = true` | `false` | ลบเงื่อนไข `!isSticker` → ต้องแดง |
| TC-03 `[blocker]` | IMAGE ที่ `fromCard = true` (รูปการ์ด carousel) | `false` | ลบเงื่อนไข `!fromCard` → ต้องแดง |
| TC-04 `[blocker]` | `AUDIO` / `PRODUCT` / `ORDER` / `TEXT` | `false` ทุกตัว | เปลี่ยนเป็น deny-list → ต้องแดง |
| TC-05 `[blocker]` | ชนิดที่ไม่รู้จัก (`'SOMETHING_NEW'`) | `false` (fail-closed) | เปลี่ยน default เป็น `true` → ต้องแดง |
| TC-06 `[blocker]` | `hasFile = false` แม้ type เป็น IMAGE | `false` | ลบเงื่อนไข → ต้องแดง |
| TC-07 `[blocker]` | `resolveLibraryOwner` เมื่อมี `externalContactId` | คืน `{ externalContactId }` **ไม่มี** `conversationId` | สลับลำดับ if → ต้องแดง |
| TC-08 `[blocker]` | `resolveLibraryOwner` เมื่อ `externalContactId = null` | คืน `{ conversationId }` | — |
| TC-09 | `libraryTileAriaLabel` ผันตามชนิด | IMAGE→"รูปจาก…" · VIDEO→"วิดีโอจาก…" · FILE→"{ชื่อไฟล์} จาก…" | hardcode "รูปจาก" → ต้องแดง |
| TC-10 | `toLibraryKind('AUDIO')` | `null` (ไม่ throw) | — |
| TC-11 `[blocker]` | `LIBRARY_COPY` ไม่มีคำว่า "บันทึก" ในค่าที่เป็น action | ไม่มี key ไหนของ save/unsave มีสตริง `บันทึก` | เปลี่ยน `save` เป็น "บันทึกเข้าคลัง" → ต้องแดง |

## 2. Unit tests — `src/services/__tests__/customer-file-library.service.test.ts`

| ID | เคส | คาดหวัง |
|---|---|---|
| TC-20 `[blocker]` | `saveToLibrary` เขียน `sentAt` จาก `ChatMessage.createdAt` | ไม่ใช่เวลาปัจจุบัน — mutation เป็น `new Date()` ต้องแดง |
| TC-21 `[blocker]` | `saveToLibrary` ชน P2002 | คืน `{ created: false }` ไม่ throw |
| TC-22 `[blocker]` | `saveToLibrary` ไม่ทำ find-then-create | สแกนซอร์ส: ห้ามมี `findFirst`/`findUnique` บน `customerFile` ก่อน `create` ในฟังก์ชันนี้ |
| TC-23 `[blocker]` | ทุก query ของ service มี `shopId` ในเงื่อนไข | สแกนซอร์ส: ทุก `prisma.customerFile.<op>` ต้องมี `shopId` ใน where |
| TC-24 `[blocker]` | `saveToLibrary` หา message ด้วย `{ id, conversationId }` พร้อมกัน | ลบ `conversationId` ออก → ต้องแดง (ไม่งั้นเก็บข้อความจากเธรดอื่นได้) |
| TC-25 | `listLibrary` เรียง `sentAt DESC, id DESC` | ลำดับตรงตามที่กำหนด |
| TC-26 | `listLibrary` คืน `total` เป็น count จริง ไม่ใช่ `items.length` | คลัง 12 ใบ `take=9` → `total = 12` |
| TC-27 | `removeFromLibrary` ที่ไม่มีแถวอยู่ | `{ removed: false }` ไม่ throw ไม่ 404 |
| TC-28 | `patchLibraryItem` ตัดช่องว่างแล้วว่าง → `null` | `fileName: '   '` → เก็บ `null` |

## 3. Guard tests — `src/app/__tests__/customer-file-library-guards.test.ts`

| ID | เคส | คาดหวัง |
|---|---|---|
| TC-30 `[blocker]` | ไม่มี route ฝั่งลูกค้าอ่าน `customerFile` | สแกน `src/app/(marketing)/**` + `src/app/api/app/**` + `src/app/api/o/**` = 0 |
| TC-31 `[blocker]` | route ใช้ `sessionUserId()` ไม่ใช่ cast | ห้ามมี `as { id: string }` ในไฟล์ route |
| TC-32 `[blocker]` | route ใช้ `resolveConversationShopId` | สแกนซอร์สต้องเจอการเรียกจริง (`resolveConversationShopId(`) ไม่ใช่แค่บรรทัด import |

## 4. API tests (integration — ไม่แตะ DB จริง ใช้ prisma mock)

| ID | เคส | คาดหวัง |
|---|---|---|
| TC-40 | `GET` ไม่มี session | 401 |
| TC-41 | `GET` เธรดของร้านอื่น | 404 (ไม่ใช่ 403 — ไม่ให้ probe) |
| TC-42 | `POST` messageId ของเธรดอื่น | 404 |
| TC-43 | `POST` ข้อความสติกเกอร์ | 422 |
| TC-44 | `POST` ซ้ำใบเดิม | 200 `created: false` |
| TC-45 | `GET` ส่ง `cursorId` มาตัวเดียวไม่มี `cursorSentAt` | 400 |
| TC-46 | `PATCH` ไม่ส่ง field ใดเลยนอกจาก `fileId` | 400 |
| TC-47 | `DELETE` ไม่มี `fileId` | 400 |

## 5. Browser QA (ต้องกดจริง — ยังไม่เคยรัน)

> 🛑 บทเรียน 00024 (2026-08-09) และรอบชีตคิวงาน (2026-08-12): **การประกาศว่า "ยังไม่ได้กดจริง"
> แล้ว push ไม่ได้ลดความเสียหาย** — บั๊กสองตัวที่ตามมาเห็นได้ใน 5 วินาทีแรกที่เปิดหน้าจอ

| ID | เคส | จอ |
|---|---|---|
| TC-50 | กดค้างที่รูปในเธรด → เห็น "เก็บเข้าคลัง" → กด → toast มุมขวาบน → รูปโผล่ในกริด | มือถือ 375 |
| TC-51 | กดค้างที่รูปเดิมอีกครั้ง → label เป็น "เอาออกจากคลัง" + ไอคอน filled | มือถือ |
| TC-52 | กดค้างที่**สติกเกอร์** → **ไม่มี** ตัวเลือกนี้เลย | มือถือ |
| TC-53 | hover บับเบิลรูปบนเดสก์ท็อป → เห็นปุ่ม bookmark ในกลุ่มปุ่ม | เดสก์ท็อป 1440 |
| TC-54 | hover รูปใน**อัลบั้ม** (รูปติดกันหลายใบ) → ปุ่มยังอยู่ | เดสก์ท็อป |
| TC-55 | เปิด lightbox จากเธรด → เห็นปุ่ม bookmark ในแถบเครื่องมือ → เลื่อนไปสไลด์ที่เป็นรูปการ์ด → **ปุ่มหายไป** | ทุกจอ |
| TC-56 | แผงลูกค้า → เลื่อนล่างสุด → เห็น section "คลังไฟล์" | มือถือ + เดสก์ท็อป |
| TC-57 | คลังว่าง → เห็น empty state พร้อมวิธีเก็บ **ไม่ใช่ section หายไป** | ทุกจอ |
| TC-58 | คลังมี ≤9 ใบ → **ไม่มี**ลิงก์ "ดูไฟล์ทั้งหมด" | ทุกจอ |
| TC-59 | คลังมี >9 ใบ → ลิงก์โชว์ยอดรวมจริง → กด → โมดัลเปิด **ในหน้าเดิม** (เธรดไม่เสีย scroll) | ทุกจอ |
| TC-60 | เลื่อนโมดัลถึงท้าย → โหลดเพิ่มเอง ไม่ต้องกดปุ่ม | ทุกจอ |
| TC-61 | เปิดโมดัลบนมือถือ แล้ว**ลากนิ้วบนตัวแผง** → หน้าหลังต้องไม่เลื่อนตาม | มือถือ |
| TC-62 | กด tile รูป → lightbox เห็นแถบรายละเอียด (ผู้ส่ง/ผู้เก็บ/4 ปุ่ม) | ทุกจอ |
| TC-63 | กด "ดูในแชท" → ปิดโมดัล + เธรดเลื่อนไปไฮไลต์ข้อความนั้น | ทุกจอ |
| TC-64 | กด tile ไฟล์เอกสาร → การ์ดรายละเอียด **ไม่ใช่** lightbox | ทุกจอ |
| TC-65 | กด tile วิดีโอ → การ์ดรายละเอียดที่เล่นวิดีโอได้ | ทุกจอ |
| TC-66 | กด "แก้ไข" → Swal 2 ช่อง → บันทึก → ชื่อใหม่ขึ้นทันที | ทุกจอ |
| TC-67 | ลูกค้า unsend ข้อความที่เก็บไว้ → รีเฟรช → **ไฟล์ยังอยู่ในคลัง** เปิดดูได้ | ทุกจอ |
| TC-68 | ชื่อลูกค้า/ชื่อไฟล์ยาว 40+ ตัวอักษร → ไม่ดันกล่องเกินจอ ไม่มี scroll แนวนอน | มือถือ 320 |
| TC-69 | เปิดแผงด้วยบัญชีสมาชิกทีมอีกคน → เห็นคลังชุดเดียวกัน + ป้าย "เก็บโดย" ของคนแรก | เดสก์ท็อป |
| TC-70 | เปลี่ยนแท็บไป "คำสั่งซื้อ" แล้วกลับมา → ไม่เกิดการยิง API รัว (ดู Network tab) | เดสก์ท็อป |

## 6. E2E (Playwright) — ยังไม่เขียน

🛑 **ห้ามเขียน E2E ที่มีคำสั่งลบข้อมูลแบบไม่ scope** (Hard Rule 13) — ล้างด้วย
`deleteTestData({ userIds, shopIds })` ที่ผูกกับ id ที่เทสสร้างเองเท่านั้น

## 7. สรุปสถานะ

| กลุ่ม | จำนวน | สถานะ |
|---|---|---|
| Unit (lib) — `src/lib/customer-file-library.test.ts` | 20 | ✅ เขียว · พิสูจน์ด้วย mutation แล้ว (ถอดด่านสติกเกอร์ + fail-open + สลับลำดับเจ้าของ → แดง 4 เคส) |
| Guard สแกนซอร์ส — `src/services/customer-file-library.guards.test.ts` | 11 | ✅ เขียว · พิสูจน์ด้วย mutation แล้ว (find-then-create + `sentAt: new Date()` + ถอด `rawMessage: true` → แดง 3 เคส) |
| Unit (service, mock prisma) | 0 | ❌ **ยังไม่เขียน** — TC-25..TC-28 ถูกครอบด้วย guard ที่สแกนซอร์สแทนบางส่วน แต่พฤติกรรมรันจริง (ลำดับ/`total`/trim) ยังไม่มีเทส |
| API (integration) | 0 | ❌ **ยังไม่เขียน** — TC-40..TC-47 |
| Browser QA | 21 | ❌ **ยังไม่เคยกดสักเคส** |
| E2E | 0 | ❌ ยังไม่เขียน |

**ผลรันจริงทั้งรีโป ณ 2026-08-13:** `npx vitest run src/` → **233 ไฟล์ / 2703 เทส เขียวทั้งหมด**
(ไม่มีเทสแดงค้างเลย) · `tsc --noEmit` → 0 · `next build` → exit 0 · `theme-guard.sh` → exit 0

🛑 **เทสที่ยังไม่เขียน (service + API) คือหนี้จริง ไม่ใช่ "ครอบด้วย guard แล้ว"** — guard
ยืนยันได้แค่ว่า *โค้ดมีรูปร่างที่ถูก* ไม่ได้ยืนยันว่า *มันทำงานถูก* (เช่น keyset cursor
ข้ามแถวหรือวนซ้ำไหม, `total` ตรงกับจำนวนจริงไหมเมื่อมีเกิน 1 หน้า)
