<!-- Feature 00048 - Customer File Library -->

---
title: "SDS — คลังไฟล์ต่อลูกค้า"
owner: shinobu22
status: draft
created: 2026-08-13
tags: [sds, design, feature, 00048]
related: ["[[SRS]]", "[[API]]", "[[DATABASE]]", "[[UX-Design-Spec]]"]
---

# SDS: คลังไฟล์ต่อลูกค้า (00048)

## 1. โครงไฟล์

```
src/lib/customer-file-library.ts                    ← SSOT คำ + ฟังก์ชันบริสุทธิ์ (เทสได้)
src/services/customer-file-library.service.ts       ← ทุก query ผูก shopId + owner
src/app/api/chat/conversations/[id]/library/route.ts ← GET/POST/DELETE/PATCH

src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/
  ├── CustomerFileLibrarySection.tsx   ← กริด 9 ช่อง + empty + ลิงก์ดูทั้งหมด
  ├── CustomerFileLibraryModal.tsx     ← sheet(<1024)/modal(≥1024) + infinite scroll
  ├── CustomerFileDetailCard.tsx       ← การ์ดรายละเอียด (วิดีโอ/เอกสาร/ไฟล์หาย)
  ├── CustomerFileTile.tsx             ← 1 ช่องในกริด (ใช้ร่วม section + modal)
  └── SaveToLibraryButton.tsx          ← ปุ่ม hover เดสก์ท็อป

แก้ของเดิม:
  ChatThread.tsx      ← 4 จุด (action มือถือ · ปุ่ม hover บับเบิล · ปุ่ม hover อัลบั้ม · Lightbox toolbar+footer)
  CustomerPanel.tsx   ← 1 จุด (แทรก section ล่างสุดของแท็บ customer)
  page.tsx            ← ส่ง libraryOwner + savedFileIds ลงมา
  prisma/schema.prisma ← model ใหม่ + back-relation 3 บรรทัด
  src/lib/validations.ts ← LibrarySaveSchema / LibraryPatchSchema
```

---

## 2. `src/lib/customer-file-library.ts` — SSOT

```ts
export const LIBRARY_COPY = {
  save: 'เก็บเข้าคลัง',
  unsave: 'เอาออกจากคลัง',
  sectionTitle: 'คลังไฟล์',
  savedToast: 'เก็บเข้าคลังแล้ว',
  removedToast: 'เอาออกจากคลังแล้ว',
  saveFailed: 'เก็บเข้าคลังไม่สำเร็จ ลองใหม่อีกครั้ง',
  removeFailed: 'เอาออกจากคลังไม่สำเร็จ ลองใหม่อีกครั้ง',
  emptyTitle: 'ยังไม่มีไฟล์ในคลัง',
  emptyBody: 'กดค้างที่รูป วิดีโอ หรือไฟล์ในแชท แล้วเลือก "เก็บเข้าคลัง"',
  missingFile: 'ไฟล์ถูกลบแล้ว',
  seeAll: (n: number) => `ดูไฟล์ทั้งหมด (${n})`,
  modalTitle: (name: string) => `คลังไฟล์ · ${name}`,
} as const

export const LIBRARY_PREVIEW_TAKE = 9
export const LIBRARY_PAGE_TAKE = 60
export type LibraryKind = 'IMAGE' | 'VIDEO' | 'FILE'

/** เกณฑ์เดียวของ "เก็บเข้าคลังได้ไหม" — fail-closed */
export function isLibraryEligible(m: {
  type: string; isSticker?: boolean; fromCard?: boolean; hasFile: boolean
}): boolean

/** ชนิดที่เก็บลง DB — คืน null เมื่อไม่เข้าเกณฑ์ (ผู้เรียกต้องตัดสินใจต่อ ไม่ throw) */
export function toLibraryKind(type: string): LibraryKind | null

/** เจ้าของคลัง — หนึ่งใน 2 คีย์เสมอ */
export function resolveLibraryOwner(c: { id: string; externalContactId: string | null }):
  { externalContactId: string; conversationId?: never } |
  { conversationId: string; externalContactId?: never }

/** ข้อความ aria ของ tile — ผันตามชนิด (ไม่ใช่ "รูปจาก" ตายตัว) */
export function libraryTileAriaLabel(item: { kind: LibraryKind; fileName: string | null; senderName: string | null; sentAt: string }): string
```

🛑 `isLibraryEligible` และ `libraryTileAriaLabel` **ห้ามเขียนเป็นเทอร์นารีกลาง JSX** — เกณฑ์คือ
"ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
ทั้งคู่มีเทส `[blocker]` และต้องพิสูจน์ด้วย mutation

---

## 3. Service layer

```ts
listLibrary(shopId, owner, { take, cursor }) → { items, total, nextCursor }
saveToLibrary(shopId, owner, { conversationId, messageId, savedByUserId, savedByName })
  → { item, created }        // insert ตรง ๆ แล้วดัก P2002 (ห้าม find-then-create)
removeFromLibrary(shopId, owner, fileId) → { removed: boolean }
patchLibraryItem(shopId, owner, fileId, { fileName?, note? }) → item
listSavedFileIds(shopId, owner) → Set<string>   // ใช้เติม savedFileId ให้ทุกข้อความในเธรด
```

**`saveToLibrary` อ่าน snapshot จากฐาน ไม่รับจาก client:**
```
ChatMessage(where: { id: messageId, conversationId })   ← ผูกเธรดในเงื่อนไข ไม่ใช่เทียบทีหลัง
  → ถ้าไม่เจอ            → throw MESSAGE_NOT_FOUND      (404)
  → ถ้า !isLibraryEligible → throw NOT_ELIGIBLE          (422)
  → snapshot: fileId=imageUrl, kind, fileName=attachmentName, fileSize=attachmentSize,
              senderRole, senderName (จาก contact/ร้าน), sentAt=createdAt
```

🛑 **`sentAt = ChatMessage.createdAt` ไม่ใช่ `new Date()`** — คีย์เรียงลำดับของคลังคือเวลาที่ไฟล์
ถูกส่งจริง (BR-CFL-12) เขียนผิดตัวนี้แล้วคลังจะเรียงตามลำดับที่กดเก็บโดยไม่มีอะไรฟ้อง

---

## 4. จุดแก้ใน `ChatThread.tsx` (4 จุด — พลาดจุดใดจุดหนึ่งคือฟีเจอร์หายไปทั้ง surface)

| # | บรรทัดอ้างอิง | สิ่งที่ทำ |
|---|---|---|
| 1 | `actionTargetActions` (~1473-1543) | เพิ่ม `MessageAction` `'save-to-library'` — เงื่อนไข `isLibraryEligible` · label/icon สลับตาม `savedFileId` |
| 2 | `actionCluster` (~2634-2673) | ใส่ `<SaveToLibraryButton>` ในกลุ่มปุ่ม hover ของบับเบิลเดี่ยว |
| 3 | กลุ่มปุ่มอัลบั้ม (~2426-2438) | ใส่ปุ่มเดียวกัน — **อัลบั้มคือรูปหลาย `ChatMessage` ที่ถูกจัดกลุ่ม** ปุ่มผูกกับรูปนำของกลุ่ม |
| 4 | `imageSlides` (~1703-1729) + `<Lightbox>` (~3764) | สไลด์พก `messageId` + `libraryEligible` · เพิ่มปุ่ม toolbar + `render.slideFooter` |

**สถานะ saved ฝั่ง client:** `useState<Set<string>>` ที่ `ChatThread` ระดับบนสุด (ค่าเริ่มจาก
prop `savedFileIds`) — optimistic add/remove แล้วค่อยยิง API; ล้มเหลว → rollback + toast

---

## 5. จุดแก้ใน `CustomerPanel.tsx`

แทรก `<CustomerFileLibrarySection>` **ท้ายสุด** ของ `tab === 'customer'` panel

- ดึงข้อมูลแบบ client fetch เหมือน `crmSlot` (skeleton → error+ลองใหม่ → เนื้อหา)
- refetch เมื่อ: mount ของแผง · สลับกลับมาแท็บ customer · ปิดโมดัล
- 🛑 **ห้ามใส่ค่าที่ hook คืน "ทั้งก้อน" ลง dep array** — ถ้าใช้ hook ที่ `return {…}` เป็น object
  literal ให้ destructure เอาเฉพาะ `useCallback` ไปใส่ ไม่งั้นได้ลูปยิง API ไม่หยุด
  (`docs/conventions/hook-return-identity-in-deps.md` — เกิดจริงที่ `/inbox/comments`)

---

## 6. โมดัลและ overlay

- `CustomerFileLibraryModal` = React-controlled (ไม่ใช้ `hs-overlay`) ⇒ **ต้องเรียก `useLockBodyScroll(true)` เอง** และทุก `overflow-y-auto` ต้องมี `overscroll-contain` (`docs/conventions/overlay-scroll-lock.md`)
- `role="dialog"` + `aria-modal="true"` (เป็นโมดัลจริง หน้าหลังกดไม่ได้)
- infinite scroll: `IntersectionObserver` sentinel — ก๊อป pattern จาก `OrdersList` ใน `CustomerPanel.tsx`

---

## 7. ลำดับงาน (task breakdown)

| # | งาน | ผลลัพธ์ที่ตรวจได้ |
|---|---|---|
| T1 | schema + migration + `prisma generate` | `npx prisma validate` ผ่าน · migration apply บน local ได้ |
| T2 | `src/lib/customer-file-library.ts` + เทส `[blocker]` | เทสเขียว + mutation แล้วแดง |
| T3 | service + เทส | เทสเขียว |
| T4 | validations + API route | `tsc` 0 |
| T5 | UI: tile + section + modal + detail card | ประกอบเข้า `CustomerPanel` แล้วเห็นของจริง |
| T6 | UI: 4 จุดใน `ChatThread` | เก็บ/เอาออกได้จากทั้ง 3 ทางเข้า |
| T7 | เทส `[blocker]` กันถอยหลัง + `tsc` + `build` | เขียวทั้งชุด |
| T8 | sync `docs/SRS.md` | 3 จุดตาม SRS §6 |

**ห้าม mark T ใดเสร็จโดยไม่ชี้ได้ว่าโค้ดบรรทัดไหนบังคับ + เทสตัวไหนแดงถ้าเอาบรรทัดนั้นออก**
(`docs/conventions/rule-must-be-enforced-not-described.md`)
