# Chat Multi-Attachment — แนบหลายไฟล์ ทุกชนิด (feature 00018 extension)

- **วันที่:** 2026-08-02
- **สถานะ:** Draft — รอ user review
- **ขอบเขต:** หน้าแชท seller (`src/app/(paces)/seller/(chat)/inbox/[conversationId]`) เท่านั้น
- **Mockup:** [`2026-08-02-chat-multi-attachment-mockup.html`](./2026-08-02-chat-multi-attachment-mockup.html)
- **ต่อยอดจาก:** feature 00011 (Deep Chat), 00018 (Facebook/IG chat integration)

---

## 1. โจทย์

ตอนนี้ปุ่มแนบในหน้าแชทเลือกไฟล์ได้ **ทีละ 1 ไฟล์** และรับ **เฉพาะรูป** (jpg/png/webp ≤5MB)
ร้านต้องการแนบได้ **หลายไฟล์รวดเดียว ไม่จำกัดจำนวน** และ **รองรับไฟล์ทุกชนิด** (ใบเสนอราคา PDF,
ไฟล์ Excel, วิดีโอรีวิวสินค้า, ไฟล์เสียง ฯลฯ)

### สิ่งที่มีอยู่แล้ว (ไม่ต้องสร้างใหม่)

| ของที่มี | ที่อยู่ |
|---|---|
| คิวไฟล์รอส่งแบบหลายรายการ `pendingImages[]` | `useSellerChatThread.ts:140` |
| อัปโหลดหลายไฟล์เรียงลำดับ (paste คลิปบอร์ด) | `useSellerChatThread.ts:443` |
| บับเบิลแสดง `VIDEO` / `AUDIO` / `FILE` ในเธรด | `ChatThread.tsx:1274-1298` |
| ตาราง ext↔MIME + `isInlineExt` (SSOT) | `src/lib/attachment-mime.ts` |
| serve ไฟล์ + `nosniff` + force-download ไฟล์ที่เรนเดอร์ inline ไม่ได้ | `src/app/api/files/[...fileId]/route.ts:235-255` |
| Supabase `uploads` bucket: MIME allow-all + 25MB | แก้ไว้ตั้งแต่ 2026-07-25 |
| ปุ่ม "บันทึกเป็น…" / share-to-device | `ChatThread.tsx:208-300` |

### คอขวดจริง (สิ่งที่ต้องแก้)

| # | คอขวด | ที่อยู่ |
|---|---|---|
| B-1 | `<input type="file">` ไม่มี `multiple` + `accept` ล็อกไว้ 3 ชนิด | `ChatThread.tsx:1488-1494` |
| B-2 | `uploadFile` ตรวจ `CHAT_IMAGE_ALLOWED_TYPES` + cap 5MB | `useSellerChatThread.ts:408-416` |
| B-3 | `/api/upload` เรียก `validateUpload` = allow-list 12 MIME + `MAX_SIZE` 5MB | `src/lib/storage/types.ts:44-47` |
| B-4 | route ส่งข้อความรับแค่ `TEXT/IMAGE/PRODUCT/ORDER` + เช็ค ext เป็นรูปเท่านั้น | `messages/route.ts:266-274` |
| B-5 | `sendOutboundMessage` มีแต่ `imageFileId` → `sendImageMessage` | `channel-chat.service.ts:1019-1039` |
| B-6 | ไม่มีที่เก็บชื่อไฟล์เดิม (storage ตั้งชื่อเป็น `YYYY/MM/DD/uuid.ext`) | `prisma/schema.prisma` ChatMessage |
| B-7 | rate-limit 30 ข้อความ/นาที/user แต่ 1 ไฟล์ = 1 ข้อความ | `messages/route.ts:243` |

---

## 2. ข้อจำกัดของแพลตฟอร์ม (ตรวจจาก Meta docs 2026-08-02)

"ทุกไฟล์ ไม่จำกัด" ทำได้จริง 100% เฉพาะแชท **DEEP** (ในแอปเรา)
ช่องทางนอกมีเพดานของ Meta ที่เราคุมไม่ได้:

| ช่องทาง | รูป | วิดีโอ | เสียง | ไฟล์อื่น |
|---|---|---|---|---|
| **DEEP** | ทุกชนิด ≤25MB | ทุกชนิด ≤25MB | ทุกชนิด ≤25MB | ทุกชนิด ≤25MB |
| **MESSENGER** | jpg/png/gif/webp ≤25MB | ≤25MB | ≤25MB | ทุกชนิด ≤25MB |
| **INSTAGRAM** | **png/jpeg ≤8MB** | mp4/ogg/avi/mov/webm ≤25MB | aac/m4a/wav/mp4 ≤25MB | **PDF เท่านั้น** ≤25MB |

**การตัดสินใจ (user 2026-08-02):** กรองตามช่องทาง + บอกเหตุผลเป็นภาษาไทยตอนแนบ
(ไม่ปล่อยให้ส่งแล้วค่อยขึ้นบับเบิลแดง)

---

## 3. สถาปัตยกรรม

```
[ChatThread.tsx]  ปุ่มแนบ multiple · วางไฟล์ (paste) · ลากวาง (drop)
        │  File[]
        ▼
[useSellerChatThread.uploadFile]  ── ตรวจล่วงหน้าด้วย ─→ [lib/chat-attachment.ts]
        │  FormData                                        (กฎกลาง pure — client+server)
        ▼
[POST /api/chat/upload]  ── ตรวจซ้ำด้วยกฎเดียวกัน ──→ saveFile(skipValidation)
        │  { fileId, name, size, mime, kind }
        ▼
[pendingAttachments[]]  ── กดส่ง → 1 ไฟล์ = 1 payload ──┐
                                                        ▼
                              [POST /api/chat/conversations/:id/messages]
                                    │  ตรวจซ้ำ (authoritative) + channel matrix
                       ┌────────────┴────────────┐
              channel = DEEP              channel ≠ DEEP
                       │                          │
              [chat.service.sendMessage]  [channel-chat.sendOutboundMessage]
                                                  │
                                          [graph.sendAttachmentMessage]
                                            type: image|video|audio|file
```

### 3.1 `src/lib/chat-attachment.ts` (ไฟล์ใหม่)

จุดเดียวที่รู้ว่า "ไฟล์นี้ส่งช่องทางนี้ได้ไหม" — **pure module** ไม่ import อะไรจาก server
(ห้าม import `@/lib/storage`, `@/lib/prisma`) เพื่อให้ client bundle ได้

```ts
export const ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024   // ตรงกับ bucket + Meta
export const IG_IMAGE_MAX_SIZE   = 8 * 1024 * 1024    // เพดาน IG เฉพาะรูป

/** ext ที่บล็อกทุกช่องทาง — ไฟล์รันได้/สคริปต์/เอกสารที่รันสคริปต์ได้ */
export const BLOCKED_EXT: readonly string[]

export type AttachmentKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE'

/** จัด kind จาก MIME ก่อน ถ้าไม่รู้จักค่อย fallback ที่ ext */
export function attachmentKind(mime: string, ext: string): AttachmentKind

/** ตัวตัดสินเดียวของทั้งระบบ */
export function checkChannelSupport(
  channel: string,                    // 'DEEP' | 'MESSENGER' | 'INSTAGRAM'
  file: { kind: AttachmentKind; mime: string; ext: string; size: number },
): { ok: true } | { ok: false; reason: string }   // reason = ข้อความไทยที่โชว์ได้เลย
```

**`BLOCKED_EXT`** (user เลือก deny-list — "อนุญาตทุกอย่าง ยกเว้นที่รันได้"):

```
exe msi msix com scr pif cpl bat cmd ps1 psm1 vbs vbe wsf wsh
sh bash zsh csh run bin appimage
apk ipa app pkg dmg deb rpm jar class
dll sys drv ocx
js mjs cjs jse hta html htm xhtml shtml svg svgz
lnk url reg inf scf gadget
```

เหตุผลของบางตัวที่อาจดูเกินเหตุ:
- `html`/`htm`/`svg` — `/api/files` ตั้ง `Content-Disposition: attachment` + `nosniff`
  ให้อยู่แล้ว (`attachment-mime.ts:81-90` เอา svg ออกจาก `INLINE_EXTS` โดยตั้งใจ) แต่ยัง
  บล็อกที่ชั้นอัปโหลดด้วย เพราะ **defense-in-depth**: ถ้าอนาคตมีคนแก้ `INLINE_EXTS`
  โดยไม่รู้บริบทนี้ ไฟล์เก่าที่ค้างอยู่ในระบบจะกลายเป็น stored XSS ทันที
- `jar`/`class` — Android/Java payload ที่ปลอมเป็นเอกสารได้ง่าย

**ไม่บล็อก** (ผ่านได้): `zip rar 7z tar gz doc docx xls xlsx ppt pptx pdf txt csv json psd ai
sketch fig dwg mp4 mov mkv mp3 wav …` — ไฟล์ธุรกิจปกติที่ร้านใช้จริง

**`checkChannelSupport` — ตารางกฎ:**

| ช่องทาง | kind | เงื่อนไขผ่าน | ข้อความเมื่อไม่ผ่าน |
|---|---|---|---|
| ทุกช่องทาง | ทุก kind | `ext ∉ BLOCKED_EXT` | `ไฟล์ชนิด .{ext} ส่งไม่ได้ด้วยเหตุผลด้านความปลอดภัย` |
| ทุกช่องทาง | ทุก kind | `size ≤ 25MB` | `ไฟล์ใหญ่เกิน 25MB (ไฟล์นี้ {n}MB)` |
| DEEP | ทุก kind | ผ่านหมด | — |
| MESSENGER | IMAGE | `ext ∈ {jpg,jpeg,png,gif,webp}` | `Messenger รองรับรูป jpg/png/gif/webp เท่านั้น` |
| MESSENGER | VIDEO/AUDIO/FILE | ผ่าน | — |
| INSTAGRAM | IMAGE | `ext ∈ {jpg,jpeg,png}` **และ** `size ≤ 8MB` | `Instagram รองรับรูป jpg/png ไม่เกิน 8MB` |
| INSTAGRAM | VIDEO | `ext ∈ {mp4,ogg,avi,mov,webm}` | `Instagram รองรับวิดีโอ mp4/mov/avi/webm/ogg เท่านั้น` |
| INSTAGRAM | AUDIO | `ext ∈ {aac,m4a,wav,mp4}` | `Instagram รองรับไฟล์เสียง aac/m4a/wav เท่านั้น` |
| INSTAGRAM | FILE | `ext === 'pdf'` | `Instagram ส่งได้เฉพาะไฟล์ PDF` |

ช่องทางที่ยังไม่มีในระบบ (LINE feat 00025 / TikTok feat 00020) → **default deny พร้อมเหตุผล
"ช่องทางนี้ยังไม่รองรับไฟล์แนบ"** ไม่ใช่ default allow — กันไม่ให้ feature ที่ยังไม่เสร็จ
เปิดช่องส่งไฟล์โดยไม่ตั้งใจ

### 3.2 `POST /api/chat/upload` (route ใหม่)

**ทำไมไม่แก้ `/api/upload` เดิม:** route นั้นถูกใช้โดย verification L2/L3 (บัตรประชาชน/selfie/
ทะเบียนธุรกิจ), รูปสินค้า, สลิปเติมเงิน, badge ของ admin — การไปคลาย `validateUpload`
(allow-list 12 MIME + 5MB) ที่นั่นแปลว่าทุก surface นั้นรับไฟล์ทุกชนิด 25MB ตามไปด้วย
โดยไม่มีใครขอ

```
POST /api/chat/upload      (multipart: file)
  200 → { fileId, name, size, mime, kind }
  400 → { error: "<เหตุผลไทยจาก checkChannelSupport>" }
  401 → ไม่มี session
  413 → ไฟล์ใหญ่เกิน 25MB
```

- ต้องมี session (เหมือน `/api/upload`)
- รับ query `?conversationId=` **optional** — ถ้าส่งมา route จะ resolve `channel` ของเธรดนั้น
  แล้วตรวจ `checkChannelSupport` ด้วย; ไม่ส่งมา = ตรวจแค่กฎกลาง (deny-list + ขนาด)
  → client ส่งเสมอเพื่อให้เจอปัญหาตั้งแต่ตอนแนบ ไม่ใช่ตอนกดส่ง
- ผ่านแล้วเรียก `saveFile(file, { skipValidation: true })` — เพราะ route นี้ทำ validation
  ของตัวเองครบแล้ว (pattern เดียวกับ media mirror ใน `channel-chat.service.ts:330-331`)
- **`name` ที่คืนกลับ = ชื่อ sanitize แล้ว**: ตัด path separator, ตัด control char,
  cap 200 ตัวอักษร (กัน header injection ตอน `Content-Disposition` และ UI พัง)

### 3.3 Client — `useSellerChatThread.ts`

**เปลี่ยนชนิดข้อมูลคิว** (ฟิลด์ใหม่เป็น optional ทั้งหมด → caller เดิมไม่ต้องแก้):

```ts
export type PendingAttachment = {
  fileId: string
  previewUrl: string          // objectURL (รูป/วิดีโอ) | '' (ชนิดอื่น)
  name?: string               // ชื่อไฟล์เดิม — ไม่มี = derive จาก fileId
  size?: number
  mime?: string
  kind?: AttachmentKind       // ไม่มี = derive จาก ext ของ fileId
}
export type PendingImage = PendingAttachment   // alias — ChatWidgetThreadPanel ใช้ชื่อเดิม
```

`pendingImages` / `setPendingImage` / `setPendingImages` **คงชื่อเดิมทั้งหมด** เพราะ
`ChatWidgetThreadPanel.tsx` (widget แดชบอร์ด) กับ product-pick / quick-message ใช้ contract นี้อยู่
(เพิ่ม alias `pendingAttachments` ให้ ChatThread เรียกชื่อที่ตรงความหมาย)

**`uploadFile(file)`** — ลำดับการทำงาน:
1. `attachmentKind(file.type, ext)` → kind
2. `checkChannelSupport(channel, {...})` → ไม่ผ่าน = `pacesToast.error(reason)` แล้ว **ข้ามไฟล์นี้**
   (ไฟล์อื่นในชุดเดียวกันยังอัปโหลดต่อ — ไม่ล้มทั้งชุดเพราะไฟล์เดียว)
3. `previewUrl` = `URL.createObjectURL(file)` เฉพาะ IMAGE/VIDEO; ชนิดอื่นเป็น `''`
4. `POST /api/chat/upload?conversationId=…`
5. push เข้าคิว

**`handleFileChange`** — วน `Array.from(e.target.files)` ทีละไฟล์ **เรียงลำดับ (ไม่ `Promise.all`)**
เหตุผลเดียวกับที่ `QuickMessageManager.tsx:215` ทำ: ลำดับไฟล์ที่แนบต้องตรงกับลำดับที่ลูกค้าเห็น

**`handlePaste`** — เดิมกรอง `it.type.startsWith('image/')` → เปลี่ยนเป็นรับทุก `it.kind === 'file'`

**`handleDrop`** (ใหม่) — รับ `e.dataTransfer.files` เข้า `uploadFile` ตัวเดียวกัน

**ตัวบอกความคืบหน้า** — เดิม `uploading: boolean` ใช้ไม่พอเมื่อมี N ไฟล์
เพิ่ม `uploadProgress: { done: number; total: number } | null` (คง `uploading` ไว้ให้ widget เดิม)

**`handleSend`** — โครงเดิมทั้งหมด (รูปทั้งหมดก่อน → caption เป็น TEXT ใบสุดท้าย, reply ผูกใบแรก,
ยิงเรียงทีละใบ) เปลี่ยนแค่:

```diff
- ...pendingImages.map((img) => ({ type: 'IMAGE' as const, imageUrl: img.fileId, body: null })),
+ ...pendingAttachments.map((a) => ({
+     type: a.kind ?? 'IMAGE',
+     imageUrl: a.fileId,
+     attachmentName: a.name ?? null,
+     attachmentSize: a.size ?? null,
+     body: null,
+   })),
```

optimistic bubble ต้องพก `attachmentName`/`attachmentSize` ไปด้วย ไม่งั้นชิปไฟล์จะขึ้นชื่อว่าง
ระหว่างรอ POST กลับ

### 3.4 Client — `ChatThread.tsx`

**ปุ่มแนบ** (`:1488`)
```diff
- <input type="file" accept="image/jpeg,image/png,image/webp" ... />
+ <input type="file" multiple ... />
```
`accept` เอาออกทั้งหมด (ไม่ใส่ `accept="*/*"` — Safari บางเวอร์ชันตีความแล้วซ่อนไฟล์บางชนิด)
`aria-label` เปลี่ยนจาก "แนบรูปภาพ" → "แนบไฟล์"

**ชิปพรีวิว** (`:1610-1628`) — แยก 2 หน้าตาตาม kind:
- `IMAGE` / `VIDEO` → thumbnail เดิม (วิดีโอใช้ `<video>` ไม่มี controls + ไอคอน play ทับ)
- `AUDIO` / `FILE` → ชิป Paces: `.card` + ไอคอนตาม ext + ชื่อไฟล์ (truncate 1 บรรทัด) + ขนาด

**Drop zone** (ใหม่) — ห่อ **เฉพาะ panel เธรด + composer** ด้วย `onDragOver / onDragLeave / onDrop`
⚠️ **ห้ามห่อทั้งหน้า** — จะชนกับ `SwipeableRow.tsx` (ปัดแถวในกล่องขาเข้า) และแผง
`ShipmentDraftPanel`. overlay ใช้ `after:border-dashed` ของ Paces (Hard Rule 7 — ห้าม arbitrary value)

**บับเบิลไฟล์** (`:1287-1298`) — เปลี่ยนจาก "เปิดไฟล์แนบ" ตายตัวเป็น:
```
[ไอคอนตาม ext]  ใบเสนอราคา-สมชาย.pdf
                 1.2 MB · บันทึก
```
`MediaDownloadLink` ตั้งชื่อไฟล์ตอนดาวน์โหลดจาก `attachmentName` (fallback = basename ของ fileId
เหมือนเดิมสำหรับข้อความเก่า/ไฟล์ที่ mirror มาจาก Messenger)

### 3.5 Backend — schema

```prisma
model ChatMessage {
  // ...
  // ไฟล์แนบ (2026-08-02): ชื่อไฟล์เดิมที่ผู้ส่งเลือก + ขนาด ณ ตอนส่ง (snapshot)
  // storage ตั้งชื่อจริงเป็น YYYY/MM/DD/uuid.ext ชื่อเดิมจึงหายถ้าไม่เก็บไว้ที่นี่
  // null = ข้อความเก่าก่อนฟีเจอร์นี้ หรือไฟล์ที่ mirror มาจาก Messenger/IG (Meta ไม่ส่งชื่อมา)
  attachmentName String?
  attachmentSize Int?
}
```

**Migration:** additive nullable ทั้งคู่ — ไม่มี default, ไม่ backfill, ไม่ล็อกตาราง
เขียนไฟล์ migration **ด้วยมือ** แล้ว `prisma migrate deploy` (ห้าม `migrate dev` — DB นี้แชร์กัน,
ดู `docs/conventions/prod-db-safety.md` + Hard Rule 14) **ต้องขอ user ยืนยันก่อนรันกับ prod**

### 3.6 Backend — `messages/route.ts`

**`SendChatMessageSchema`** (`validations.ts:710`):
```diff
- type: v.picklist(["TEXT", "IMAGE", "PRODUCT", "ORDER"]),
+ type: v.picklist(["TEXT", "IMAGE", "VIDEO", "AUDIO", "FILE", "PRODUCT", "ORDER"]),
+ attachmentName: v.nullish(v.pipe(v.string(), v.maxLength(200))),
+ attachmentSize: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(0))),
```

**ลำดับใน route ต้องสลับ:** ตอนนี้ conditional-required (`:262-285`) ทำ **ก่อน** query
`conversation.channel` (`:293`) — แต่การตรวจ channel matrix ต้องรู้ channel ก่อน
→ ย้าย `prisma.conversation.findUnique` ขึ้นมาไว้เหนือบล็อก validate

```ts
// แทนที่บล็อก type === "IMAGE" เดิม
if (["IMAGE","VIDEO","AUDIO","FILE"].includes(type)) {
  if (!imageUrl) return 400 "กรุณาแนบไฟล์"
  const ext = fileIdExt(imageUrl).toLowerCase()
  const check = checkChannelSupport(conv?.channel ?? "DEEP", {
    kind: type, ext, mime: EXT_TO_MIME[ext] ?? "", size: attachmentSize ?? 0,
  })
  if (!check.ok) return 400 check.reason
}
```

⚠️ `attachmentSize` มาจาก client จึงเชื่อไม่ได้ 100% — ใช้เป็นแค่ **ตัวกรองเชิงประสบการณ์**
(ให้ error สวย ๆ) เพดานขนาด **ตัวจริง** บังคับตอนอัปโหลดที่ `/api/chat/upload` ซึ่งเห็นไฟล์จริง
(และ bucket ยัง cap 25MB อีกชั้น) — ระบุไว้ให้ชัดเพื่อไม่ให้ใครเข้าใจผิดว่าบรรทัดนี้คือ security control

`sendMessage()` (DEEP) และ `sendOutboundMessage()` รับ `attachmentName` / `attachmentSize` เพิ่ม

### 3.7 Backend — `graph.ts` + `channel-chat.service.ts`

```ts
// graph.ts — generalize
export async function sendAttachmentMessage(
  pageToken: string, recipientId: string,
  type: 'image' | 'video' | 'audio' | 'file',
  url: string, replyToMid?: string | null, tag?: string,
): Promise<string>

// คงตัวเดิมไว้เป็น wrapper — auto-reply-send.service.ts ยังเรียก imageFileId อยู่
export const sendImageMessage = (t, r, url, reply?, tag?) =>
  sendAttachmentMessage(t, r, 'image', url, reply, tag)
```

`sendOutboundMessage` (`channel-chat.service.ts:963`):
```diff
- imageFileId?: string
+ imageFileId?: string                     // deprecated — auto-reply-send.service.ts ยังใช้
+ attachment?: { fileId: string; kind: AttachmentKind; name?: string; size?: number }
```
ภายในรวมเป็นตัวแปรเดียว (`imageFileId` → `{kind:'IMAGE'}`) แล้วใช้ `sendAttachmentMessage`
เส้นทาง retry-without-reply_to (`:1043-1055`) ต้องแก้ตามให้ครบ **ทั้งสองที่**
(บทเรียนเดิม: แก้ที่เดียวแล้ว fallback path ยังส่งรูปแบบเก่า)

`preview` ที่เขียนลง `Conversation.lastMessagePreview` (`:1068`):
```
IMAGE → [รูปภาพ]   VIDEO → [วิดีโอ]   AUDIO → [ข้อความเสียง]   FILE → [ไฟล์: {name}]
```

### 3.8 Rate limit — แยกเพดานตามบทบาท

`chat-constants.ts`:
```ts
export const CHAT_RATE_LIMIT_MAX = 30        // buyer (เดิม — BR-CHAT-07)
export const CHAT_RATE_LIMIT_MAX_SHOP = 120  // ร้าน (2026-08-02, multi-attachment)
```

`messages/route.ts` — ย้าย `senderRole` derive (`:288-289`) ขึ้นมาก่อนบล็อก rate-limit (`:243`):
```ts
const max = senderRole === "SHOP" ? CHAT_RATE_LIMIT_MAX_SHOP : CHAT_RATE_LIMIT_MAX
if (!checkApiRateLimit(`chat-send:${userId}`, max, CHAT_RATE_LIMIT_WINDOW_MS)) → 429
```

key ยังเป็น per-user เหมือนเดิม เจตนาเดิมของ BR-CHAT-07 คือ **กัน buyer สแปมร้าน**
(ดู `docs/20 - Features/00011 - Deep Chat/PRD.md` ตาราง Risks) — การผ่อนให้ฝั่งร้าน
จึงไม่ได้ลดการป้องกันที่ตั้งใจไว้แต่แรก

🛑 **ต้องแก้เอกสารตาม** — `docs/20 - Features/00011 - Deep Chat/SRS.md` lock ค่า `30/min/user`
ไว้เป็นค่าเดียวทั้งระบบ ถ้าไม่แก้ เอกสารจะขัดกับโค้ด (บทเรียน `feedback_write_docs_from_code_not_memory`)

---

## 4. Error handling

| สถานการณ์ | พฤติกรรม |
|---|---|
| ไฟล์อยู่ใน deny-list | toast แดง ระบุนามสกุล — ข้ามไฟล์นั้น ไฟล์อื่นในชุดยังไปต่อ |
| ไฟล์เกิน 25MB | toast แดงพร้อมขนาดจริง — ข้ามไฟล์นั้น |
| ช่องทางไม่รองรับชนิดนั้น | toast แดงพร้อมเหตุผลเฉพาะช่องทาง — ข้ามไฟล์นั้น |
| อัปโหลดล้ม (เครือข่าย/S3) | toast + revoke objectURL — ข้ามไฟล์นั้น |
| แนบผ่านแต่ Meta ปฏิเสธตอนส่ง | บับเบิลนั้น `_status='failed'` กดลองใหม่ได้ (กลไกเดิม) |
| ชน rate limit (>120 สำหรับร้าน) | toast "ส่งข้อความถี่เกินไป" + บับเบิลที่เหลือเป็น failed (กลไกเดิม) |

toast ทุกตัวใช้ `pacesToast` (Hard Rule 9) — placement `top-right` เพราะเป็นผลจากการกดปุ่ม
ไม่ใช่ข้อความเข้า (`pacesToast.chat.*` = bottom-right)

---

## 5. เทส

**Unit — `src/lib/__tests__/chat-attachment.test.ts` (ใหม่)**
- deny-list: `.exe`/`.sh`/`.svg`/`.html` ไม่ผ่านทุกช่องทาง
- ขนาด: 25MB ผ่าน, 25MB+1 ไม่ผ่าน
- IG: `.pdf` ผ่าน / `.docx` ไม่ผ่าน / รูป 9MB ไม่ผ่าน / รูป 7MB ผ่าน
- MESSENGER: `.docx` ผ่าน (ต่างจาก IG)
- DEEP: `.psd`/`.zip` ผ่าน
- ช่องทางที่ไม่รู้จัก (`'LINE'`) → `ok: false` (default deny)
- `attachmentKind`: MIME ชนะ ext; MIME ว่าง → fallback ext; ไม่รู้จักทั้งคู่ → `FILE`

**Route — `messages/route.test.ts` (ต่อยอดของเดิม)**
- `type=FILE` + `.pdf` บนเธรด DEEP → 201
- `type=FILE` + `.exe` → 400
- `type=FILE` + `.docx` บนเธรด INSTAGRAM → 400 พร้อมเหตุผล
- `senderRole=SHOP` ส่งข้อความที่ 31 ใน 1 นาที → **ไม่ 429** (เพดาน 120)
- `senderRole=BUYER` ส่งข้อความที่ 31 → 429 (TC-CHAT-23 เดิมต้องไม่แตก)

**Service — `channel-chat-image.test.ts` (ต่อยอด)**
- `attachment.kind='VIDEO'` → `sendAttachmentMessage` ถูกเรียกด้วย `type: 'video'`
- fallback path (reply_to ถูกปฏิเสธ) ยังส่ง kind เดิม ไม่ถอยกลับเป็น image

**E2E (Playwright, per `feedback_qa_playwright_e2e_mandatory`)**
- แนบ 3 ไฟล์ต่างชนิด (png + pdf + mp4) รวดเดียว → เห็นชิป 3 อัน → กดส่ง → 3 บับเบิล เรียงลำดับถูก
- ลากไฟล์วางในเธรด → เข้าคิว
- ลบชิปทีละอัน → คิวลดถูกตัว

🛑 เทสห้ามมี `deleteMany()` ไม่มี `where` / `TRUNCATE` / `migrate reset` (Hard Rule 13)
ล้างข้อมูลด้วย `deleteTestData({ userIds, shopIds })` เท่านั้น

---

## 6. Out of scope

- composer ของ **widget แชทบนแดชบอร์ด** (`ChatWidgetThreadPanel.tsx`) — ไม่แก้ แต่ต้อง
  คอมไพล์ผ่านและใช้งานได้เท่าเดิมผ่าน optional field + type alias
- composer ของ **แชทฝั่งผู้ซื้อ** (`(marketing)/(buyer-app)/messages`) — คนละธีม (Vuexy) แก้แยกรอบ
- **LINE (feat 00025) / TikTok (feat 00020)** — ยังไม่ live → `checkChannelSupport` default deny
- upload แบบ resumable/chunked สำหรับไฟล์ใหญ่กว่า 25MB
- บีบอัด/แปลงไฟล์อัตโนมัติ (เช่น ย่อรูปให้ผ่านเพดาน 8MB ของ IG)
- ส่งหลายรูปเป็น "อัลบั้มเดียว" ผ่าน Meta (Send API รับ attachment ทีละชิ้น)

---

## 7. ประเด็นที่ต้องให้ user ตัดสิน

### D-1 🛑 ไฟล์แนบในแชทถูก serve แบบ **ไม่ต้องล็อกอิน**

`/api/files/[...fileId]/route.ts` มี gate เฉพาะไฟล์ KYC, สลิปเติมเงิน, สลิปออเดอร์ และหลักฐาน
รายงานมิจฉาชีพ — **นอกนั้น serve เป็น `public, max-age=86400` ให้ใครก็ได้ที่รู้ fileId**
(`route.ts:228-250`)

วันนี้ไฟล์แนบในแชทมีแต่รูป ความเสี่ยงจึงต่ำ แต่พอเปิดให้แนบ **ใบเสนอราคา ใบแจ้งหนี้ ไฟล์ Excel
รายชื่อลูกค้า** ไฟล์เหล่านั้นจะกลายเป็น URL สาธารณะที่เดาไม่ได้แต่ก็ไม่ได้ถูกป้องกัน
(fileId เป็น uuid + ชาร์ดตามวันที่ — เดายาก แต่ถ้าหลุดไปครั้งเดียวคือเปิดถาวร)

**ข้อเสนอ:** เพิ่ม gate ที่ 5 — `ChatMessage.imageUrl = fileId` → ต้องมี session และเป็น
`canAccessShop(shopId)` หรือเป็น buyer ของเธรดนั้น พร้อม `Cache-Control: private, no-cache`
(ต้องเพิ่ม index บน `ChatMessage.imageUrl`; ไม่กระทบ Meta เพราะ Meta ดึงผ่าน **presigned S3 URL**
ไม่ใช่ `/api/files`)

ผลข้างเคียง: รูปแชทเก่าที่เคยเปิดได้โดยไม่ล็อกอินจะต้องล็อกอิน — ถูกต้องกว่าเดิมแต่เป็นการ
เปลี่ยนพฤติกรรม จึงต้องให้ user เคาะ

**ทางเลือก:** (ก) gate ทุกไฟล์แนบแชท · (ข) gate เฉพาะ kind `FILE` (เอกสาร) ปล่อยรูป/วิดีโอ
ตามเดิม · (ค) ไม่ทำ รับความเสี่ยงไว้ แล้วบันทึกเป็น known gap

### D-2 ข้อความเก่าที่ mirror มาจาก Messenger ไม่มีชื่อไฟล์

`attachmentName` เป็น null สำหรับทุกข้อความก่อนฟีเจอร์นี้ **และ** ไฟล์ที่ mirror มาจาก Meta
(Meta ไม่ส่งชื่อไฟล์เดิมมากับ webhook) → บับเบิลจะ fallback เป็น `uuid.pdf`

ยอมรับตามนี้ หรืออยากให้ fallback เป็นข้อความทั่วไป เช่น `ไฟล์แนบ.pdf`

---

## 8. Gate ที่ต้องผ่านก่อน mark complete

| Gate | รายละเอียด |
|---|---|
| Hard Rule 8 | invoke `safepay-ux` ออก Design Spec **ก่อน** แตะโค้ด frontend |
| Hard Rule 8 | รัน `/impeccable critique` + `/impeccable clarify` หลัง build UI |
| Hard Rule 7 | ไม่มี arbitrary Tailwind value ในชิป/overlay — `rg` ตรวจ |
| Hard Rule 9 | `rg "react-toastify" "src/app/(paces)/"` = 0 |
| Hard Rule 12 | ไม่มี emoji ใน UI — ไอคอนตาม ext ต้องเป็น tabler icon จริง |
| Hard Rule 13 | เทสไม่มีคำสั่งลบข้อมูลแบบไม่ scope |
| Hard Rule 14 | migration รันด้วย `migrate deploy` + ขอ user ยืนยันก่อนแตะ prod |
| Hard Rule 11 | อัปเดต feature docs ของ 00018 + แก้ `SRS.md` ของ 00011 (rate limit) |
