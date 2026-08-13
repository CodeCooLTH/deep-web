<!-- Feature 00048 - Customer File Library -->

---
title: "SRS — คลังไฟล์ต่อลูกค้า"
owner: shinobu22
status: draft
created: 2026-08-13
tags: [srs, spec, feature, 00048]
related: ["[[PRD]]", "[[BRD]]", "[[SDS]]", "[[DATABASE]]", "[[API]]"]
---

# SRS: คลังไฟล์ต่อลูกค้า (00048)

## 1. ขอบเขตทางเทคนิค

| ชั้น | ของใหม่ | ของเดิมที่แตะ |
|---|---|---|
| DB | `CustomerFile` (1 ตาราง) + back-relation 3 บรรทัด | — |
| lib | `src/lib/customer-file-library.ts` (SSOT คำ + ฟังก์ชันบริสุทธิ์) | — |
| service | `src/services/customer-file-library.service.ts` | — |
| API | `/api/chat/conversations/[id]/library` (GET/POST/DELETE/PATCH) | — |
| UI | `CustomerFileLibrarySection` · `CustomerFileLibraryModal` · `CustomerFileDetailCard` · `SaveToLibraryButton` | `ChatThread.tsx` (4 จุด) · `CustomerPanel.tsx` (1 จุด) · `page.tsx` (ส่ง prop เจ้าของคลัง) |

---

## 2. นิยามที่ต้องมีนิยามเดียวทั้งระบบ (Hard Rule 16)

| คำ | นิยามเดียว | อยู่ที่ |
|---|---|---|
| "เก็บเข้าคลัง" / "เอาออกจากคลัง" / "คลังไฟล์" | คำที่ผู้ใช้เห็นทุก surface | `src/lib/customer-file-library.ts` → `LIBRARY_COPY` |
| "ไฟล์นี้เก็บเข้าคลังได้ไหม" | `isLibraryEligible({ type, isSticker, fromCard })` | ไฟล์เดียวกัน |
| "เจ้าของคลังของเธรดนี้คือใคร" | `resolveLibraryOwner({ externalContactId, conversationId })` | ไฟล์เดียวกัน |

🛑 **ห้ามพิมพ์คำว่า "เก็บเข้าคลัง" ซ้ำในไฟล์อื่น** — ทุก surface ต้อง import จาก SSOT
🛑 **ห้ามใช้คำว่า "บันทึก" กับการเก็บเข้าคลัง** — ในเธรดเดียวกันมี `MediaDownloadLink label="บันทึกวิดีโอ"` และ Lightbox `Download` plugin ที่แปลว่า "โหลดลงเครื่อง" อยู่แล้ว

---

## 3. Functional spec (ต่อยอดจาก FR-CFL-01..24 ใน BRD)

### 3.1 เกณฑ์ "เก็บเข้าคลังได้"

```
isLibraryEligible(msg) =
     msg.type === 'IMAGE' && !msg.isSticker && !msg.fromCard
  || msg.type === 'VIDEO'
  || msg.type === 'FILE'
```
- `AUDIO` / `PRODUCT` / `ORDER` / `TEXT` → false
- รูปในการ์ด carousel มาจาก `ChatMessage.cards[]` ไม่ใช่ `imageUrl` → `fromCard = true`
- **fail-closed**: ชนิดที่ไม่รู้จัก → false (เพิ่มชนิดใหม่ในอนาคตต้องมาเปิดที่นี่โดยตั้งใจ)

### 3.2 เจ้าของคลัง

```
resolveLibraryOwner(conv) =
  conv.externalContactId ? { externalContactId }
                         : { conversationId: conv.id }
```
ทุก query ต้องมี `shopId` เป็นเงื่อนไขร่วมเสมอ (defense in depth) แม้ owner จะระบุเจาะจงอยู่แล้ว

### 3.3 การเรียงลำดับและแบ่งหน้า

- เรียง `sentAt DESC, id DESC` (keyset — ไม่ใช้ OFFSET)
- cursor = `{ sentAt, id }` ของแถวสุดท้ายที่ส่งไป
- พรีวิวในแผง: `take = 9` + `count` ทั้งหมด (ลิงก์ "ดูไฟล์ทั้งหมด (N)" โผล่เมื่อ `count > 9`)
- โมดัล: `take = 60` ต่อหน้า ไม่มีเพดานจำนวนแถวรวม

### 3.4 Toggle และการกันซ้ำ

1. `POST` เขียนแถวใหม่ทันที **ไม่ pre-check**
2. ชน `P2002` → ถือว่าสำเร็จ (idempotent) คืนแถวที่มีอยู่
3. `DELETE` ลบแถวจริง (hard delete — แถวคลังเป็นดัชนีอ้างอิง ไม่ใช่ต้นฉบับ)

🛑 **ห้ามเปลี่ยนเป็น find-then-create** — สองคนกดพร้อมกันจะลอดช่องระหว่าง SELECT กับ INSERT
ความถูกต้องต้องอยู่ที่ `@@unique` เสมอ (`docs/conventions/insert-then-catch-logs-every-error.md`)

> **หมายเหตุต้นทุนที่รับไว้แล้ว:** แพตเทิร์นนี้ทำให้ Postgres เขียน ERROR ลง log ทุกครั้งที่ชน
> — แต่การกดซ้ำไฟล์เดิมเป็นเหตุการณ์ที่**ไม่ควรเกิดบ่อย** (UI สลับปุ่มเป็น "เอาออกจากคลัง" ไปแล้ว)
> ต่างจากเคส `ChatMessage_externalMessageId_key` ที่ชน 100% ทุกใบ ⇒ ไม่คุ้มที่จะเพิ่ม pre-check

### 3.5 สถานะ "ไฟล์นี้อยู่ในคลังแล้ว" ที่ฝั่งเธรด

`ChatMessageView` เพิ่ม field `savedFileId: string | null`
- คำนวณจาก set ของ `fileId` ที่อยู่ในคลังของเจ้าของคลังนั้น (query เดียวตอนโหลดเธรด)
- ใช้สลับ label/ไอคอนทั้ง 3 ทางเข้า
- 🛑 **`imageSlides` ต้องพก `libraryEligible` + `messageId` ต่อสไลด์** ไม่งั้นปุ่มใน lightbox จะโผล่บนสไลด์ที่มาจากการ์ด carousel ซึ่ง §3.1 ห้ามไว้

---

## 4. Authorization

| กฎ | บังคับที่ |
|---|---|
| ต้องมี session และรู้ว่าเป็นใคร | `sessionUserId(session)` — คืน `string \| null` ห้าม cast (`docs/conventions/session-exists-is-not-identity.md`) |
| ต้องเข้าถึงเธรดนี้ได้ | `resolveConversationShopId()` — scope สิทธิ์ใน `WHERE` ตั้งแต่คำสั่งแรก คืน `null` เหมือนกันทั้ง "ไม่มีเธรด" และ "ไม่มีสิทธิ์" |
| ทุก query ของ service | `shopId` + owner key เสมอ |
| ลูกค้าเข้าถึงไม่ได้ | ไม่มี route สาธารณะใดอ่านตารางนี้ (เทส `[blocker]` สแกนซอร์ส) |

---

## 5. NFR

| ด้าน | ข้อกำหนด |
|---|---|
| Rate limit | ใช้ bucket เดิมของ `guardApi` (mutation 30/นาที/ผู้ใช้) — พอ เพราะเก็บทีละใบด้วยมือ ไม่ใช่ bulk |
| Cache | ทุก response `private, no-store` + `export const dynamic = "force-dynamic"` |
| Payload | ไม่ส่งเบอร์/PII ใด ๆ — คืนเฉพาะ metadata ของไฟล์ + ชื่อผู้ส่ง/ผู้เก็บที่แสดงบนจอ |
| Realtime | ไม่ทำ (มติ D-19) — refetch ตอนเปิดแผง/สลับแท็บ/ปิดโมดัล |
| a11y | ทุก tile เป็น `<button>` มี `aria-label` ครบ (ปุ่มรูปเปล่าไม่มีชื่อ = screen reader อ่านไม่ออก) |

---

## 6. ผลกระทบต่อเอกสารระบบ (`docs/SRS.md`)

ต้อง sync 3 จุดหลัง merge:
1. **Data model** — เพิ่ม `CustomerFile`
2. **API reference** — เพิ่ม `/api/chat/conversations/[id]/library` (4 method)
3. **Validation rules** — เพิ่ม `LibrarySaveSchema` / `LibraryPatchSchema`

> 🛑 HR11 ระบุว่า "ครบ 7 ไฟล์ ≠ เอกสารเสร็จ" — งานที่แตะ data model/API/validation ต้อง sync
> `docs/SRS.md` ด้วยเสมอ (บทเรียน 00033 ที่ค้างจนถูกถามว่า "เหลืออะไรอีกไหม")

---

## 7. Known limitations (รับทราบแล้ว ไม่ใช่หนี้ที่ซ่อนไว้)

| ข้อจำกัด | กินเคสไหน | ทำไมยอมรับได้ |
|---|---|---|
| ไฟล์เนื้อหาเดียวกันคนละข้อความ = คนละ `fileId` | ลูกค้าส่งสลิปใบเดิมซ้ำ 2 ครั้ง แล้วผู้ขายกดเก็บทั้งคู่ | คลังมีรูปซ้ำ 2 ช่อง — น่ารำคาญแต่ไม่ผิดข้อมูล และ user เคาะรับแล้ว |
| ไม่มี realtime | เพื่อนร่วมทีมเก็บไฟล์ตอนเราเปิดแผงค้าง | เห็นเมื่อ refetch — คลังไม่ใช่ของที่เปลี่ยนวินาทีต่อวินาที |
| วิดีโอไม่เข้า lightbox | กดวิดีโอในคลัง → การ์ดรายละเอียดแทน | ชุดสไลด์ปัจจุบันไม่มี slide ชนิดวิดีโอเลย การเพิ่มคือรื้อโครงทั้งชุด (มติ Q36) |
| ไม่มีตัวกรองชนิดไฟล์ | คลังที่มีไฟล์คละชนิดจำนวนมาก | คลังต่อลูกค้า 1 คนไม่ใหญ่พอที่จะต้องกรอง |

**ไม่มีข้อไหนทำให้ฟีเจอร์ที่ ship ใช้งานไม่ได้** — ทุกข้อเป็นเรื่องความสะดวก ไม่ใช่เรื่อง "เก็บแล้วหาไม่เจอ" ซึ่งเป็นเคสที่ฟีเจอร์นี้ถูกสร้างมาแก้ (`docs/conventions/known-limitation-vs-unfinished.md`)
