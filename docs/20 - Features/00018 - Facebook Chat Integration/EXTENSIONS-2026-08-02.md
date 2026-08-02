# 00018 — Extensions (2026-08-02)

> | # | Extension | สรุป |
> |---|---|---|
> | E1 | แนบไฟล์หลายไฟล์ ทุกชนิด (ขาออก) | ปุ่มแนบเลือกได้ทีละหลายไฟล์ ไม่จำกัดจำนวน ≤25MB/ไฟล์ + ลากวาง + วางจากคลิปบอร์ด |
> | E2 | เมนูกดค้างบนมือถือ | ปุ่มตอบกลับ/คัดลอกเป็น `lg:group-hover` = ไม่เคยโผล่บนมือถือเลย |
> | E3 | auth gate เอกสารแนบใน `/api/files` | เอกสารที่แนบในแชทต้องล็อกอินและเป็นคู่สนทนา (เดิม public) |
>
> commits: `a2a15935` (backend+hook) · `43d31f91` (gate + เมนูกดค้าง) · `eb4914d9` (UI)
> · merged main `5cfceb4c` · migration `20260802160000_chat_attachment_meta` applied ทั้ง dev และ prod
>
> spec: `docs/superpowers/specs/2026-08-02-chat-multi-attachment-design.md`
> (+ mockup `2026-08-02-chat-multi-attachment-mockup.html`)

**ความสัมพันธ์กับ [[EXTENSIONS-2026-07-25]] E2:** อันนั้นคือ **ขาเข้า** (mirror ไฟล์แนบทุกชนิด
ที่ลูกค้าส่งมาจาก Meta) เอกสารนี้คือ **ขาออก** (ร้านส่งไฟล์ทุกชนิดออกไปหาลูกค้า) — คนละทิศ
คนละ path และ BR-ATT-02 ที่ประกาศไว้ว่า "ไม่ผ่อน seller upload (แยก path)" ยังคงจริงอยู่
เอกสารนี้ไม่ได้แก้กฎนั้น แต่สร้าง path ที่ 3 ขึ้นมาแทน (ดู E1.3)

---

## E1 — แนบไฟล์หลายไฟล์ ทุกชนิด (ขาออก)

### E1.1 Requirement

**Problem:** ปุ่มแนบในหน้าแชทเลือกได้ **ทีละ 1 ไฟล์** และรับเฉพาะ `image/jpeg|png|webp` ≤5MB
ร้านส่งใบเสนอราคา ไฟล์ Excel วิดีโอรีวิว ให้ลูกค้าไม่ได้เลย ต้องออกไปใช้ Messenger เอง

**ที่มา:** user request 2026-08-02 — "ตอน attach รูปในหน้า chat มันทำได้ทีละ 1 อยากให้ทำได้
multiple ไม่จำกัด และต้องรองรับทุกรูป ทุกไฟล์"

| FR | ข้อกำหนด | Acceptance |
|---|---|---|
| FR-MATT-01 | ปุ่มแนบเลือกได้หลายไฟล์พร้อมกัน ไม่จำกัดจำนวน | เลือก 8 ไฟล์รวดเดียว → ชิป 8 อันในคิว เรียงตามลำดับที่เลือก |
| FR-MATT-02 | รับไฟล์ทุกชนิดยกเว้นที่อยู่ใน deny-list (ไฟล์รันได้/สคริปต์) | `.pdf/.xlsx/.psd/.zip/.dwg` ผ่าน · `.exe/.sh/.apk/.js/.html/.svg` ไม่ผ่าน |
| FR-MATT-03 | เพดาน 25MB ต่อไฟล์ | ไฟล์ 25MB ผ่าน · 25MB+1 byte ไม่ผ่าน พร้อมบอกขนาดจริง |
| FR-MATT-04 | กรองตามข้อจำกัดของช่องทางปลายทาง พร้อมบอกเหตุผลเป็นภาษาไทย | แนบ `.docx` ในเธรด IG → "Instagram ส่งได้เฉพาะไฟล์ PDF" ตั้งแต่ตอนแนบ ไม่ใช่ตอนกดส่ง |
| FR-MATT-05 | ไฟล์ที่ไม่ผ่านถูกข้ามทีละไฟล์ ไฟล์อื่นในชุดเดียวกันไปต่อ | เลือก 5 ไฟล์ มี 2 ไฟล์ผิดกฎ → คิวเหลือ 3, toast 2 อัน |
| FR-MATT-06 | วางไฟล์จากคลิปบอร์ดได้ทุกชนิด (เดิมเฉพาะ `image/*`) | คัดลอกไฟล์จาก Finder แล้ววางในช่องพิมพ์ → เข้าคิว |
| FR-MATT-07 | ลากไฟล์มาวางในเธรดได้ | ลากไฟล์เข้าการ์ดเธรด → overlay เส้นประ, ปล่อย → เข้าคิว |
| FR-MATT-08 | ชิปพรีวิวแยกหน้าตาตามชนิด | รูป/วิดีโอ = thumbnail · ชนิดอื่น = ไอคอน+ชื่อไฟล์+ขนาด |
| FR-MATT-09 | เก็บและแสดงชื่อไฟล์เดิม + ขนาด บนบับเบิลและตอนดาวน์โหลด | ส่ง `ใบเสนอราคา-สมชาย.pdf` → บับเบิลแสดงชื่อนั้น กดบันทึกได้ไฟล์ชื่อเดิม |
| FR-MATT-10 | บอกความคืบหน้าเมื่อแนบหลายไฟล์ | แนบ 8 ไฟล์ → "กำลังอัปโหลด 3/8" |
| FR-MATT-11 | ส่งออกช่องทางนอกได้ทุก kind ไม่ใช่แค่รูป | แนบวิดีโอในเธรด Messenger → Meta ได้ `attachment.type = video` |

**Out of scope:**
- composer ของ **widget แชทบนแดชบอร์ด** (`ChatWidgetThreadPanel.tsx`) และ **แชทฝั่งผู้ซื้อ**
  (`(marketing)/(buyer-app)/messages`) — ยังแนบได้ทีละรูปเหมือนเดิม (คนละธีม แก้แยกรอบ)
- LINE (feat 00025) / TikTok (feat 00020) — ยังไม่ live → `checkChannelSupport` **default deny**
- upload แบบ resumable/chunked สำหรับไฟล์ใหญ่กว่า 25MB
- บีบอัด/แปลงไฟล์อัตโนมัติ (เช่น ย่อรูปให้ผ่านเพดาน 8MB ของ IG)
- ส่งหลายรูปเป็น "อัลบั้มเดียว" ผ่าน Meta — Send API รับ attachment ทีละชิ้น

### E1.2 Business Rules

- **BR-MATT-01** "ทุกไฟล์ ไม่จำกัด" จริง 100% เฉพาะแชท **DEEP** (ในแอปเรา) — ช่องทางนอกถูกจำกัด
  ด้วยเพดานของ Meta ที่เราคุมไม่ได้ (ตาราง E1.4). นี่คือข้อจำกัดของแพลตฟอร์ม ไม่ใช่ตัวเลือกของเรา
- **BR-MATT-02** deny-list ไม่ใช่ allow-list — ไฟล์ธุรกิจมีหางยาวมาก (`psd/ai/sketch/dwg/…`)
  allow-list จะขวางงานจริงของร้าน จึงอนุญาตทุกอย่างยกเว้นไฟล์ที่ "รันได้"
- **BR-MATT-03** `html/htm/svg` ถูกบล็อกที่ชั้นอัปโหลด **ทั้งที่** `/api/files` บังคับ
  `Content-Disposition: attachment` + `nosniff` ให้อยู่แล้ว — เป็น defense-in-depth: ถ้าอนาคต
  มีคนแก้ `INLINE_EXTS` โดยไม่รู้บริบท ไฟล์เก่าที่ค้างในระบบจะกลายเป็น stored XSS ย้อนหลังทันที
- **BR-MATT-04** 1 ไฟล์ = 1 ข้อความ (Meta ไม่รองรับหลายไฟล์ในข้อความเดียว) ลำดับ = **ไฟล์ทั้งหมด
  ก่อน แล้วค่อยข้อความปิดท้าย** ตามที่ user สั่งไว้ 2026-07-23 (ไม่เปลี่ยน)
- **BR-MATT-05** อัปโหลดทีละไฟล์เรียงกัน ไม่ `Promise.all` — ลำดับในคิวคือลำดับข้อความที่ลูกค้าเห็น
- **BR-MATT-06** `attachmentSize` ที่ส่งมากับ payload ตอนส่งข้อความ **เชื่อไม่ได้** (client ปลอมได้)
  ใช้เป็นตัวกรองเชิงประสบการณ์เท่านั้น — เพดานตัวจริงบังคับที่ `POST /api/chat/upload`
  ซึ่งเป็นจุดเดียวที่เห็นไฟล์จริง (+ bucket cap 25MB อีกชั้น)
- **BR-MATT-07** ชื่อไฟล์ถูก sanitize **สองที่** (ตอนอัปโหลด + ตอนส่งข้อความ) เพราะชื่อนี้ไปโผล่ใน
  `Content-Disposition` ตอนดาวน์โหลด — path separator → `_`, ตัด control char/quote, cap 200 ตัว

### E1.3 Data / Code

**`src/lib/chat-attachment.ts` (ใหม่)** — จุดเดียวที่ตอบว่า "ไฟล์นี้ส่งช่องทางนี้ได้ไหม"
pure module **ห้าม import `@/lib/storage` หรือ `@/lib/prisma`** เพราะ client import เข้ามาด้วย
(barrel ของ storage ลาก driver local/s3 เข้า client bundle)

| export | หน้าที่ |
|---|---|
| `ATTACHMENT_MAX_SIZE` = 25MB | ตรงกับ `file_size_limit` ของ Supabase bucket `uploads` (26214400) และเพดาน Send API |
| `IG_IMAGE_MAX_SIZE` = 8MB | เพดานเฉพาะ "รูป" ของ IG (วิดีโอ/เสียง/ไฟล์ยัง 25MB) |
| `BLOCKED_EXT` | deny-list ไฟล์รันได้/สคริปต์ |
| `attachmentKind(mime, ext)` | MIME ชนะ ext เสมอ; ไม่รู้จักทั้งคู่ → `FILE` (ไม่เดาเป็น media) |
| `checkChannelSupport(channel, file)` | ตัวตัดสิน คืน `reason` ภาษาไทยที่โชว์ได้ตรง ๆ |
| `sanitizeAttachmentName(name)` | กรอง control char ด้วย codePoint + `[\\/]`→`_` + cap 200 |
| `attachmentDisplayName(key, name?)` | ไม่มีชื่อเดิม → `"ไฟล์แนบ.<ext>"` ไม่ใช่ uuid |
| `formatAttachmentSize(bytes?)` | `"86 KB"` / `"1.2 MB"` |

**`POST /api/chat/upload` (ใหม่)** — path ที่ 3 ของการอัปโหลด

ทำไมไม่แก้ `/api/upload` เดิม: route นั้นเรียก `validateUpload()` (allow-list 12 MIME + 5MB)
และถูกใช้ร่วมกันโดย verification L2/L3 (บัตรประชาชน/selfie/ทะเบียนธุรกิจ), รูปสินค้า,
สลิปเติมเงิน, badge ของ admin — คลายกฎที่นั่นคือเปิดให้ทุก surface นั้นรับไฟล์ทุกชนิด 25MB
โดยไม่มีใครขอ (สอดคล้องกับ BR-ATT-02 ของ E2 ที่แยก path ของ mirror ออกมาด้วยเหตุผลเดียวกัน)

```
POST /api/chat/upload?conversationId=<uuid>     (multipart: file)
  201 → { fileId, name, size, mime, kind }
  400 → { error: "<reason จาก checkChannelSupport>" }
  401 → ไม่มี session
  403 → มี session แต่ไม่ใช่คู่สนทนาของเธรดนี้
  404 → ไม่พบห้องแชท
  413 → ไฟล์ใหญ่เกิน 25MB
  500 → saveFile ล้ม (log เฉพาะ kind/ext/size — ไม่ log ชื่อไฟล์/fileId ตาม RC-8)
```
`conversationId` optional (ไม่ส่ง = ตรวจแค่กฎกลาง) แต่ client ส่งเสมอเพื่อให้เจอปัญหาเฉพาะช่องทาง
ตั้งแต่ตอนแนบ. route เช็คสิทธิ์เธรด **ก่อน** resolve channel — ถ้าไม่เช็ค ใครที่ล็อกอินก็ probe ได้ว่า
`conversationId` ไหนมีอยู่จริง

**Schema** — `ChatMessage` (additive nullable, migration `20260802160000_chat_attachment_meta`)

| คอลัมน์ | เหตุผล |
|---|---|
| `attachmentName String?` | storage ตั้งชื่อจริงเป็น `YYYY/MM/DD/uuid.ext` ชื่อที่ผู้ส่งเลือกจึงหายหมด |
| `attachmentSize Int?` | แสดงบนบับเบิล/ชิป |
| `@@index([imageUrl])` | lookup ย้อนกลับ fileId → ข้อความ ให้ gate ของ E3 ใช้ (ไม่มี = full scan ตารางใหญ่สุดในระบบทุกครั้งที่เปิดไฟล์) |

`NULL` = ข้อความก่อนฟีเจอร์นี้ **หรือ** ไฟล์ที่ mirror มาจาก Meta (webhook ไม่ส่งชื่อไฟล์เดิมมา)
→ UI fallback ผ่าน `attachmentDisplayName()`

**API — `POST /api/chat/conversations/[id]/messages`**

- `SendChatMessageSchema.type` เพิ่ม `VIDEO | AUDIO | FILE` (เดิม 3 ชนิดนี้เกิดได้ทางเดียวคือ
  mirror ขาเข้าที่เขียน DB ตรง ไม่ผ่าน schema นี้)
- เพิ่ม `attachmentName` (≤200) / `attachmentSize` (int ≥0)
- **สลับลำดับใน route**: ย้าย `prisma.conversation.findUnique` ขึ้นมา **ก่อน** บล็อก
  conditional-required เพราะกฎของไฟล์แนบขึ้นกับช่องทางปลายทาง (`.docx` ส่ง Messenger ได้
  แต่ส่ง IG ไม่ได้) — ตัดสินไม่ได้เลยถ้ายังไม่รู้ channel
- **ถอด `CHAT_IMAGE_ALLOWED_EXT`** ออกจาก route — กฎย้ายไป `checkChannelSupport` ที่รู้ทั้งชนิด
  ไฟล์และช่องทาง

**Graph / outbound**

- `graph.ts`: `sendAttachmentMessage(token, recipient, type, url, replyToMid?, tag?)` — generalize
  จาก `sendImageMessage` (payload ต่างกันแค่ `attachment.type`); ตัวเดิมคงไว้เป็น wrapper เพราะ
  `auto-reply-send.service.ts` ยังเรียกอยู่
- `channel-chat.service.ts`: `sendOutboundMessage` เพิ่มพารามิเตอร์ `attachment { fileId, kind, name, size }`
  (`imageFileId` เดิม = deprecated แต่ยังทำงาน) — **รวมสองทางเข้าเป็นตัวแปรเดียวก่อนใช้**
  เพื่อไม่ให้ retry path (ตอน Meta ปฏิเสธ `reply_to`) ส่งผิดชนิดเงียบ ๆ ซึ่งเป็นบั๊กที่เห็นเฉพาะรอบ retry
- `GRAPH_ATTACHMENT_TYPE` map: `IMAGE→image · VIDEO→video · AUDIO→audio · FILE→file`
  (คู่ตรงข้ามของ `MEDIA_TYPE` ที่ใช้ขาเข้า)
- preview ใน `Conversation.lastMessagePreview`: `[รูปภาพ] · [วิดีโอ] · [ข้อความเสียง] · [ไฟล์] <ชื่อ>`

**Client**

- `useSellerChatThread.ts`: `PendingImage` → `PendingAttachment` (ฟิลด์ใหม่ **optional ทั้งหมด**
  เพื่อให้ caller เดิม — widget แดชบอร์ด, การเลือกสินค้า, ข้อความสำเร็จรูป — ไม่ต้องแก้);
  `pendingKind()` derive kind จาก ext ของ fileId เมื่อไม่มี metadata; `uploadFiles()` วนทีละไฟล์;
  `handleDropFiles()`; `uploadProgress {done,total}`
- `ChatThread.tsx`: `<input multiple>` **ไม่ใส่ `accept` เลย** (ไม่ใช่ wildcard — Safari บางเวอร์ชัน
  ตีความ wildcard แล้วซ่อนไฟล์บางชนิดในกล่องเลือก); drop zone ครอบ **เฉพาะการ์ดเธรด** ไม่ใช่ทั้งหน้า
  (ครอบทั้งหน้าจะชนกับ `SwipeableRow` ที่ปัดแถวในกล่องขาเข้า และแผงร่างพัสดุคนละคอลัมน์);
  นับชั้น `dragenter/leave` แทน toggle เพราะสองอีเวนต์นี้ยิงซ้ำตอนลากผ่าน element ลูก

**Rate limit — แยกเพดานตามบทบาท**

`CHAT_RATE_LIMIT_MAX_SHOP = 120` (ร้าน) · `CHAT_RATE_LIMIT_MAX = 30` (ผู้ซื้อ ค่าเดิม)
เพราะ 1 ไฟล์ = 1 ข้อความ ร้านที่แนบ 40 ไฟล์รวดเดียวจะโดนกฎที่ตั้งมากันลูกค้าสแปม เล่นงานตัวเอง
เจตนาเดิมของ **BR-CHAT-07** (feat 00011) คือกัน buyer สแปมร้าน การผ่อนเฉพาะฝั่งร้านจึงไม่ได้
ลดการป้องกันที่ตั้งใจไว้แต่แรก — key ยังเป็น per-user เหมือนเดิม
🛑 **แก้ `docs/20 - Features/00011 - Deep Chat/SRS.md` §TFR-CHAT-06 ตามแล้ว** (เดิม lock 30 ค่าเดียว)

### E1.4 ข้อจำกัดของแพลตฟอร์ม (Meta docs, ตรวจ 2026-08-02)

| ช่องทาง | รูป | วิดีโอ | เสียง | ไฟล์อื่น |
|---|---|---|---|---|
| **DEEP** | ทุกชนิด ≤25MB | ทุกชนิด ≤25MB | ทุกชนิด ≤25MB | ทุกชนิด ≤25MB |
| **MESSENGER** | `jpg png gif webp` ≤25MB | ≤25MB | ≤25MB | ทุกชนิด ≤25MB |
| **INSTAGRAM** | `jpg png` **≤8MB** | `mp4 ogg avi mov webm` ≤25MB | `aac m4a wav mp4` ≤25MB | **PDF เท่านั้น** ≤25MB |
| อื่น ๆ (LINE/TikTok) | — | — | — | default deny: "ช่องทางนี้ยังไม่รองรับไฟล์แนบ" |

---

## E2 — เมนูกดค้างบนข้อความ (มือถือ)

### E2.1 Requirement

**Problem:** ปุ่ม "ตอบกลับ" และ "คัดลอก" ข้างบับเบิลเป็น `lg:group-hover:flex` = ผูกกับ hover
ซึ่งจอสัมผัสไม่มี — ปุ่มจึง **ไม่เคยโผล่บนมือถือเลยสักครั้ง** ไม่ใช่แค่ "กดยาก"

**ที่มา:** user report 2026-08-02 — "ใน mobile เวลาจะใช้ ปุ่ม reply, copy ทำไม่ได้ เพราะเราใช้
hover ใช่ป่ะ อยากให้เป็นกดค้างไว้ที่ข้อความ แล้วมี bubble action ลอยขึ้นมา"

| FR | ข้อกำหนด | Acceptance |
|---|---|---|
| FR-LP-01 | กดค้าง 500ms บนบับเบิล → เมนูลอยเหนือจุดที่กด | กดค้างบนข้อความ → เห็นเมนู ตอบกลับ/คัดลอก |
| FR-LP-02 | ยกเลิกเมื่อนิ้วขยับเกิน 10px หรือมีนิ้วที่สอง | เลื่อนอ่านข้อความปกติ → เมนูไม่เด้ง |
| FR-LP-03 | เมนูพลิกลงล่างเมื่อชนขอบบนจอ | กดค้างข้อความบนสุด → เมนูอยู่ใต้จุดกด ไม่ล้นจอ |
| FR-LP-04 | ปิดเมื่อแตะที่อื่น / เลื่อนเธรด / กด Esc | เลื่อนเธรด → เมนูปิด |
| FR-LP-05 | เงื่อนไข "ตอบกลับได้" ตรงกับปุ่มฝั่ง desktop | ข้อความที่ยังส่งไม่สำเร็จ/ถูกลบ → ไม่มีปุ่มตอบกลับ |

### E2.2 Data / Code

- `src/hooks/useLongPress.ts` (ใหม่) — 500ms (ตรงกับ threshold ของ context menu ระบบ iOS/Android),
  `MOVE_TOLERANCE` 10px, `navigator.vibrate(15)` (Android; iOS ไม่มี — ข้ามเงียบ ๆ),
  `onContextMenu` preventDefault กัน callout ของ iOS ทับเมนูเรา
- `MessageActionBubble.tsx` (ใหม่) — Base: theme/paces dropdown (`.dropdown-item`); portal ที่
  `document.body` เพราะ Chat Rail มี `overflow`/`transform` ที่ clip ตัว `fixed`
  (บทเรียนเดียวกับ `ChatContextMenu` — user report 2026-07-23); tap target 44px;
  `scroll` listener ใช้ `capture: true` เพราะตัวที่เลื่อนจริงคือ container ของเธรด ไม่ใช่ `window`
- `ChatThread.tsx`: `useLongPress` **ตัวเดียว** ที่ container แล้ว resolve ย้อนกลับว่านิ้วอยู่บน
  ข้อความไหนผ่าน `data-message-id` + `document.elementFromPoint` — hook เรียกในลูปไม่ได้
  ผลพลอยได้คือใช้ได้กับบับเบิลทุกชนิด (รูป/ไฟล์/การ์ด) โดยไม่ต้องแตะ render ของแต่ละชนิด
- "คัดลอก" ในเมนูใช้ `pacesToast.success` (ต่างจากฝั่ง desktop ที่สลับไอคอนเป็นเช็คถูก) เพราะเมนู
  ปิดทันทีที่เลือก จึงไม่มีปุ่มค้างให้เปลี่ยนไอคอน

---

## E3 — auth gate เอกสารแนบใน `/api/files`

### E3.1 Requirement

**Problem:** `/api/files/[...fileId]` มี gate เฉพาะ KYC, สลิปเติมเงิน, สลิปออเดอร์ และหลักฐาน
รายงานมิจฉาชีพ — **นอกนั้น serve เป็น `public, max-age=86400`** ให้ใครก็ได้ที่รู้ fileId
ตอนที่แชทแนบได้แต่รูป ความเสี่ยงต่ำ แต่พอ E1 เปิดให้แนบใบเสนอราคา ใบแจ้งหนี้ ไฟล์รายชื่อลูกค้า
เอกสารพวกนั้นจะกลายเป็น URL สาธารณะทันที (uuid เดายาก แต่หลุดครั้งเดียว = เปิดได้ถาวร)

| FR | ข้อกำหนด | Acceptance |
|---|---|---|
| FR-CDOC-01 | ไฟล์ที่เป็น `ChatMessage.type = FILE` ต้องมี session | เปิด URL แบบไม่ล็อกอิน → 401 |
| FR-CDOC-02 | ต้องเป็นคู่สนทนา (ร้าน = เจ้าของ/สมาชิก, หรือ buyer ของเธรด) หรือ admin | ร้านอื่นเปิด → 403 |
| FR-CDOC-03 | ไม่ cache ที่ browser/CDN | response header เป็น `private, no-cache` |

### E3.2 Business Rules

- **BR-CDOC-01** ครอบ **เฉพาะ `type=FILE`** ไม่ครอบรูป/วิดีโอ (ผลตัดสิน user 2026-08-02 ทางเลือก ข)
  — ปิดความเสี่ยงที่ E1 สร้างขึ้นใหม่ โดยไม่เปลี่ยนพฤติกรรมของรูปแชทที่ใช้งานกันอยู่เดิม
- **BR-CDOC-02** ไม่กระทบการส่งออก Meta — Graph ดึงไฟล์ผ่าน **presigned S3 URL** (อายุ 1 ชม.)
  ไม่ใช่ `/api/files` ซึ่ง auth-gated อยู่แล้วตั้งแต่แรก
- **BR-CDOC-03** gate นี้เป็นด่านที่ **5** ต่อจาก KYC → slip เติมเงิน → slip ออเดอร์ → หลักฐานมิจฉาชีพ
  และทำงานเฉพาะเมื่อ 4 ด่านแรกไม่ match (ไม่ query ซ้อนโดยไม่จำเป็น)

### E3.3 Known gap

รูป/วิดีโอ/เสียงที่แนบในแชทยัง `public, max-age=86400` ตามเดิม — ถ้าภายหลังตัดสินใจปิดด้วย
ให้เปลี่ยนเงื่อนไข query จาก `type: "FILE"` เป็น `type: { in: [...] }` ที่จุดเดียวกัน
(index `ChatMessage_imageUrl_idx` รองรับอยู่แล้ว) ผลข้างเคียงคือรูปแชทเก่าที่เคยเปิดได้โดยไม่
ล็อกอินจะต้องล็อกอิน

---

## สถานะการตรวจ (ณ 2026-08-02)

| ด่าน | สถานะ |
|---|---|
| `tsc --noEmit` | ผ่าน (0 error) |
| `next build` | ผ่าน (route `/api/chat/upload` ติดใน manifest) |
| Unit test `chat-attachment` | 43/43 ผ่าน (`src/lib/__tests__/chat-attachment.test.ts`) |
| Unit test ที่เกี่ยวข้องเดิม | `channel-chat-image` + `channel-chat-outbound` 72/72 ผ่าน |
| grep emoji (HR12) / arbitrary value (HR7) | 0 |
| migration | applied ทั้ง dev (`localhost:5434`) และ prod (Supabase) |
| **เทส route** (รับ FILE, ปฏิเสธ `.exe`, ปฏิเสธ non-PDF บน IG, เพดาน 120 vs 30) | 🛑 **ยังไม่เขียน** |
| **E2E Playwright** | 🛑 **ยังไม่เขียน** |
| **Browser QA** | 🛑 **ยังไม่ทำ** — ขึ้น prod โดยผ่านแค่ static check + build |
| **`/impeccable critique` + `clarify`** (HR8) | 🛑 **ยังไม่รัน** |
| **`safepay-ux` Design Spec** (HR8) | ข้าม — session สั่งห้ามเรียก subagent; ใช้ spec+mockup ที่ commit ไว้แทน |
