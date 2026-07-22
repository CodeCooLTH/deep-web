---
title: "BRD — Facebook Chat Integration"
owner: shinobu22
status: draft
module: M00018-FacebookChatIntegration
version: "1.0"
created: 2026-07-22
tags: [feature, chat, messaging, facebook, instagram, seller, integration, brd]
related: ["[[PRD]]", "[[../../PRD]]", "[[../00011 - Deep Chat/BRD]]", "[[../../superpowers/specs/2026-07-22-facebook-chat-integration-design]]"]
---

> **โมดูล:** M00018-FacebookChatIntegration
> **ประเภทเอกสาร:** Business Requirements Document (BRD) — NON-TECHNICAL
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-22
> **สถานะ:** Draft — อิง Design Spec ที่ยังไม่ผ่าน user review, รอ sign-off ก่อนเข้า SRS (Hard Rule 11)
> **เจ้าของเอกสาร:** BA (ดู [[Feature-Docs-Ownership]])

# BRD: Facebook Chat Integration (Business Requirements Document)

---

## 1. บทนำ

### 1.1 วัตถุประสงค์ของเอกสาร

1. กำหนด Functional Requirements ระดับ non-technical สำหรับการเชื่อม Facebook Page (Messenger) และ Instagram DM เข้ากับ `/inbox` ของ Deep
2. กำหนดกฎการเชื่อม/จัดการ Page, กฎการรับ-ส่งข้อความ (24-hour window, is_echo), และกฎการผูกลูกค้าเข้า Customer Directory
3. ระบุเงื่อนไขการรับงาน (Acceptance Criteria) แบบ Given/When/Then สำหรับทีม QA — โดยเฉพาะ idempotency ของ webhook, scope ownership ของ Page, และ zero-regression บน Deep Chat เดิม
4. สร้างความเข้าใจร่วมกันระหว่างทีมธุรกิจและทีมพัฒนาก่อนเริ่ม implement รวมถึงบันทึกข้อจำกัดจาก Meta ที่กระทบ business flow โดยตรง

### 1.2 ขอบเขตของระบบ

**Facebook Chat Integration** คือการขยายฟีเจอร์ `00011 - Deep Chat` ให้ "channel-aware" — รองรับข้อความจาก Facebook Page (Messenger) และ Instagram DM เข้ามาปรากฏใน `/inbox` ของ seller เดียวกับที่ใช้ตอบ Deep Chat เดิม แล้วส่งคำตอบกลับออกไปยัง Meta จริงผ่าน Send API มีหน้าต่างเวลา 24 ชั่วโมงที่บังคับใช้ตามมาตรฐาน Meta และรองรับ echo (ข้อความที่ seller ตอบจากแอป Messenger โดยตรง)

**เข้าสู่ระบบ (Input):** คำสั่งเชื่อม/ถอด Page จากหน้า `/seller/settings/channels`; webhook payload จาก Meta (ข้อความ text/รูปภาพ, echo, redelivery); ข้อความที่ seller พิมพ์/แนบรูปตอบจาก `/inbox`; คำสั่งสร้างออเดอร์จากเธรด

**ออกจากระบบ (Output):** `ShopChannel` ที่เชื่อม/ถอดแล้ว; `Conversation`/`ChatMessage` ที่บันทึก+broadcast; ข้อความที่ส่งออกจริงไปยัง Messenger/IG ผ่าน Send API; `Order` ที่สร้างจากเธรด พร้อม `Customer`/`ExternalContact` ที่ผูกกัน

**ระบบที่เกี่ยวข้อง:** `Conversation`/`ChatMessage` (feature 00011), `Customer` (feature 00014), `/orders/new`, `lib/storage`, `guardApi`/`src/proxy.ts`, Meta Graph API/Send API/Webhook

### 1.3 กลุ่มผู้ใช้งาน

| กลุ่มผู้ใช้ | บทบาท | สิทธิ์การใช้งาน |
|-----------|--------|----------------|
| **Seller (เจ้าของร้าน)** | เชื่อม Page, รับ-ส่งข้อความ, สร้างออเดอร์จากเธรด | เห็น/ตอบเฉพาะ `ShopChannel`/`Conversation` ของร้านตนเอง; ต้องมีสิทธิ์ Page task `MESSAGING`+`MODERATE` จึงเชื่อม Page ได้ |
| **ลูกค้า Facebook/Instagram (ExternalContact)** | ส่งข้อความเข้า Page/IG | ไม่ใช่ user ของ Deep — ไม่มีสิทธิ์เข้าถึงระบบ Deep โดยตรง |
| **Buyer (Deep user)** | ไม่เกี่ยวข้องกับ feature นี้โดยตรง | เธรด FB ไม่ปรากฏฝั่ง buyer app — ไม่มีการเปลี่ยนแปลงใด ๆ |
| **Admin** | ไม่มีสิทธิ์เข้าถึงเนื้อหาบทสนทนาหรือจัดการ Page ของร้าน | นอกขอบเขต MVP |

---

## 2. ความต้องการหลัก (Functional Requirements)

### 2.1 รับข้อความเข้า (Inbound)

#### FR-FBC-01: รับข้อความ TEXT จาก Messenger/IG เข้า `/inbox`

**User Story:** ในฐานะ Seller ฉันต้องการให้ข้อความที่ลูกค้าทักผ่าน Messenger/Instagram ปรากฏใน `/inbox` ของ Deep เพื่อไม่ต้องเปิดแอปอื่นเช็คแยก

**Acceptance Criteria:**
- [ ] `[FR-FBC-01-AC-01]` **Given** Page เชื่อมกับร้านและ subscribe webhook แล้ว **When** ลูกค้าส่งข้อความ TEXT เข้า Page/IG **Then** ระบบบันทึกข้อความเข้า `Conversation` ที่ผูกกับ `ShopChannel` นั้นและอัปเดต `lastInboundAt`
- [ ] `[FR-FBC-01-AC-02]` **Given** webhook POST เข้ามา **When** ตรวจ `X-Hub-Signature-256` ไม่ผ่าน **Then** ตอบ `401` และไม่บันทึกข้อมูลใด ๆ (signature คือ authentication เดียวของ route นี้)
- [ ] `[FR-FBC-01-AC-03]` **Given** Meta ส่ง webhook payload เดิมซ้ำ (redelivery) **When** ข้อความมี `externalMessageId` ที่เคยบันทึกแล้ว **Then** ระบบไม่สร้างข้อความซ้ำ (unique constraint dedupe)
- [ ] `[FR-FBC-01-AC-04]` **Given** PSID ที่ยังไม่เคยเห็น **When** ข้อความแรกเข้ามา **Then** ระบบสร้าง `ExternalContact` ใหม่ผูกกับ `ShopChannel` นั้น พร้อมดึงชื่อ/รูปโปรไฟล์จาก Graph API
- [ ] `[FR-FBC-01-AC-05]` ทุก payload จาก webhook ต้องผ่าน validation (Valibot) ก่อนประมวลผล — ไม่เชื่อ shape จาก Meta ตรง ๆ

#### FR-FBC-02: รับข้อความ IMAGE จาก Messenger/IG เข้า `/inbox`

**User Story:** ในฐานะ Seller ฉันต้องการเห็นรูปภาพที่ลูกค้าส่งมาทาง Messenger/IG ใน `/inbox` เพื่อดูสินค้า/ปัญหาที่ลูกค้าส่งมาได้ชัดเจน

**Acceptance Criteria:**
- [ ] `[FR-FBC-02-AC-01]` **Given** ลูกค้าส่งรูปภาพเข้า Page/IG **When** webhook รับ attachment ประเภทรูป **Then** ระบบดาวน์โหลดรูปจาก URL ของ Meta แล้วอัปโหลดเข้า storage ของ Deep เอง (reuse `lib/storage`) ก่อนบันทึก `imageUrl`
- [ ] `[FR-FBC-02-AC-02]` **Given** URL รูปจาก Meta หมดอายุก่อนดาวน์โหลดสำเร็จ **When** ดาวน์โหลดล้มเหลว **Then** ระบบบันทึก error ที่เห็นได้ ไม่ทำให้ webhook ทั้ง payload ล้มเหลวไปด้วย (ไม่ block ข้อความอื่นในเธรด)

---

### 2.2 Echo (ข้อความที่ Seller ตอบจากแอป Messenger โดยตรง)

#### FR-FBC-03: รองรับ `is_echo`

**User Story:** ในฐานะ Seller ที่บางครั้งตอบลูกค้าจากแอป Messenger บนมือถือโดยตรง ฉันต้องการให้ข้อความเหล่านั้นเข้ามาบันทึกใน Deep ด้วย เพื่อให้ประวัติการสนทนาครบถ้วนตรงกับความจริง

**Acceptance Criteria:**
- [ ] `[FR-FBC-03-AC-01]` **Given** webhook message มี `message.is_echo = true` **When** ประมวลผล **Then** ระบบบันทึกข้อความเป็น `senderRole = "SHOP"` เข้า `Conversation` เดียวกับที่ลูกค้าคุยอยู่ (ไม่ใช่สร้างเธรดใหม่)
- [ ] `[FR-FBC-03-AC-02]` ข้อความ echo ที่มี `externalMessageId` ตรงกับข้อความที่ Deep เพิ่งส่งออกไปเอง (ผ่าน Send API) ต้องถูก dedupe โดย unique constraint — ไม่บันทึกซ้ำเป็น 2 แถว
- [ ] `[FR-FBC-03-AC-03]` `/inbox` แสดงข้อความ echo เหมือนข้อความที่ seller ส่งจาก Deep ทุกประการ (ไม่มี label แยกที่ทำให้สับสน)

---

### 2.3 ส่งข้อความออก + หน้าต่าง 24 ชั่วโมง

#### FR-FBC-04: ตอบกลับข้อความออกไป Messenger/IG จริง

**User Story:** ในฐานะ Seller ฉันต้องการพิมพ์/แนบรูปตอบจาก `/inbox` แล้วข้อความไปถึงลูกค้าจริงในแอป Messenger/Instagram ของเขา

**Acceptance Criteria:**
- [ ] `[FR-FBC-04-AC-01]` **Given** Conversation ที่ `channel != "DEEP"` และยังอยู่ในหน้าต่าง 24 ชม. **When** Seller ส่งข้อความ TEXT หรือ IMAGE **Then** ระบบเรียก Send API ก่อน (`messaging_type: RESPONSE`, `recipient.id = PSID/IGSID`) แล้วค่อย insert `ChatMessage` ด้วย `externalMessageId = mid` ที่ได้จาก response (ลำดับ: ส่งก่อน เขียน DB ทีหลัง)
- [ ] `[FR-FBC-04-AC-02]` **Given** Send API ตอบสำเร็จ **When** insert ChatMessage **Then** อัปเดต `lastMessageAt`/`lastMessagePreview`/`lastSenderRole` ของ Conversation ในธุรกรรมเดียวกัน
- [ ] `[FR-FBC-04-AC-03]` ส่งได้เฉพาะ Conversation ที่ `shopId` เป็นของร้านตนเอง (scope ownership เดียวกับ Deep Chat เดิม)

#### FR-FBC-05: 24-hour Messaging Window Guard

**User Story:** ในฐานะ Seller ฉันต้องการรู้ว่าเหลือเวลาเท่าไรก่อนที่จะตอบลูกค้าไม่ได้แล้ว เพื่อไม่พลาดโอกาสตอบทัน

**Acceptance Criteria:**
- [ ] `[FR-FBC-05-AC-01]` `windowExpiresAt = lastInboundAt + 24 ชั่วโมง` คำนวณจากข้อความ inbound ล่าสุดของลูกค้าเสมอ
- [ ] `[FR-FBC-05-AC-02]` **Given** ใกล้หมดเวลา (threshold ที่กำหนด) **When** เปิดเธรด **Then** แสดงแบนเนอร์เตือนเวลาที่เหลือ
- [ ] `[FR-FBC-05-AC-03]` **Given** เวลาหมดแล้ว (`now > windowExpiresAt`) **When** เปิดเธรด **Then** ปิดช่องพิมพ์ทันที พร้อมข้อความอธิบายเหตุผลตรง ๆ — **ห้าม** ปล่อยให้กดส่งแล้วค่อยแสดง error
- [ ] `[FR-FBC-05-AC-04]` MVP ไม่มีทางเลือกให้ยืดหน้าต่างเวลาด้วย message tag — ปิดแล้วคือปิด จนกว่าลูกค้าจะส่งข้อความใหม่เข้ามา (`lastInboundAt` อัปเดตใหม่)

#### FR-FBC-06: แสดงสถานะส่งข้อความไม่สำเร็จในเธรด

**User Story:** ในฐานะ Seller ฉันต้องการเห็นเหตุผลชัดเจนเมื่อข้อความที่ส่งไม่ถึงลูกค้า เพื่อไม่เข้าใจผิดว่าลูกค้าได้รับแล้ว

**Acceptance Criteria:**
- [ ] `[FR-FBC-06-AC-01]` **Given** Send API ตอบ error (ลูกค้าบล็อกร้าน, token ตาย, เหตุอื่นจาก Meta) **When** ส่งข้อความล้มเหลว **Then** บันทึก `deliveryStatus = "FAILED"` พร้อม `failureReason` และแสดงในเธรดที่ข้อความนั้นตรง ๆ — ห้าม fail เงียบ
- [ ] `[FR-FBC-06-AC-02]` **Given** token ของ Page ตายเพราะเจ้าของถอนสิทธิ์/เปลี่ยนรหัสผ่าน/ลบแอป **When** พยายามส่งข้อความ **Then** ตั้ง `ShopChannel.status = "TOKEN_INVALID"` และแสดงแบนเนอร์ "เชื่อมต่อใหม่" ที่หน้า `/seller/settings/channels`

---

### 2.4 สร้างออเดอร์จากเธรด

#### FR-FBC-07: สร้างออเดอร์ / แนบสินค้าจากเธรด FB

**User Story:** ในฐานะ Seller ฉันต้องการสร้างออเดอร์ให้ลูกค้าที่ทักผ่าน Messenger/IG ได้ทันทีจากในเธรด โดยไม่ต้องพิมพ์ข้อมูลลูกค้าซ้ำที่อื่น

**Acceptance Criteria:**
- [ ] `[FR-FBC-07-AC-01]` **Given** เธรด FB/IG ที่เปิดอยู่ **When** Seller กดปุ่มสร้างออเดอร์จากเธรด **Then** ระบบพาไป `/orders/new` พร้อม prefill ข้อมูลที่มีอยู่แล้ว (เช่น ชื่อจากโปรไฟล์ FB)
- [ ] `[FR-FBC-07-AC-02]` **Given** `ExternalContact` ของเธรดนั้นยังไม่เคยผูก `customerId` **When** สร้างออเดอร์ **Then** ระบบ**บังคับ**ให้กรอกเบอร์โทรลูกค้าก่อนบันทึกออเดอร์สำเร็จ (`Customer.phone` required+unique)
- [ ] `[FR-FBC-07-AC-03]` **Given** `ExternalContact` เคยผูก `customerId` ไว้แล้วจากครั้งก่อน **When** สร้างออเดอร์ครั้งใหม่จากเธรดเดิม **Then** ระบบใช้ `Customer` เดิมโดยไม่ต้องขอเบอร์ซ้ำ

#### FR-FBC-08: ผูกลูกค้า FB เข้า Customer Directory

**User Story:** ในฐานะ Seller ฉันต้องการให้ระบบจำลูกค้าที่เคยทัก Messenger/IG ได้ในครั้งถัดไป เพื่อไม่ต้องเริ่มต้นใหม่ทุกครั้ง

**Acceptance Criteria:**
- [ ] `[FR-FBC-08-AC-01]` **Given** สร้างออเดอร์จากเธรดสำเร็จและได้เบอร์โทรลูกค้าแล้ว **When** บันทึกออเดอร์ **Then** ระบบสร้างหรือผูก `Customer` (ตามกลไก dedup ข้ามร้านของ feature 00014) แล้วเซ็ต `ExternalContact.customerId` ครั้งเดียว
- [ ] `[FR-FBC-08-AC-02]` **Given** `ExternalContact.customerId` ถูกผูกแล้ว **When** PSID/IGSID เดิมทักเข้ามาอีกครั้ง **Then** ระบบแสดงว่าเป็นลูกค้าที่รู้จักแล้วในบริบทของเธรด (ไม่ใช่ลูกค้าใหม่)

---

### 2.5 เชื่อม/จัดการ Facebook Page และ Instagram

#### FR-FBC-09: เชื่อม Facebook Page เข้าระบบ

**User Story:** ในฐานะ Seller เจ้าของร้าน ฉันต้องการเชื่อม Facebook Page ของร้านเข้ากับ Deep ได้เองจากหน้า settings เพื่อเริ่มรับข้อความจาก Messenger

**Acceptance Criteria:**
- [ ] `[FR-FBC-09-AC-01]` **Given** Seller อยู่ที่ `/seller/settings/channels` **When** กด "เชื่อม Facebook Page" **Then** ระบบพาไป Facebook Login for Business (แยกจาก OAuth login ของระบบ — คนละ dialog, คนละ App) ขอ scope `pages_messaging`/`pages_show_list`/`pages_manage_metadata`/`pages_read_engagement`/`business_management`
- [ ] `[FR-FBC-09-AC-02]` **Given** OAuth สำเร็จ **When** ระบบ `GET /me/accounts` **Then** แสดงเฉพาะ Page ที่ Seller มี task `MESSAGING` **และ** `MODERATE` — Page ที่ไม่มีสิทธิ์นี้ไม่แสดงให้เลือก
- [ ] `[FR-FBC-09-AC-03]` **Given** Seller เลือกได้หลาย Page พร้อมกัน **When** ยืนยันการเชื่อม **Then** ระบบเก็บ page access token แบบเข้ารหัส (AES-256-GCM) ต่อ Page แล้ว `POST /{page-id}/subscribed_apps` เพื่อ subscribe webhook
- [ ] `[FR-FBC-09-AC-04]` **Given** Page ที่เลือกถูกเชื่อมกับร้านอื่นอยู่แล้ว (ละเมิด unique (provider, externalId)) **When** พยายามเชื่อม **Then** ระบบปฏิเสธพร้อมข้อความอธิบายชัดเจนว่า Page นี้ถูกเชื่อมกับร้านอื่นแล้ว — ไม่ silent fail

#### FR-FBC-10: ผูก Instagram DM อัตโนมัติ

**User Story:** ในฐานะ Seller ที่มี Instagram Business Account ผูกกับ Page อยู่แล้ว ฉันต้องการให้ระบบเชื่อม IG ให้อัตโนมัติโดยไม่ต้องทำ OAuth ซ้ำ

**Acceptance Criteria:**
- [ ] `[FR-FBC-10-AC-01]` **Given** Page ที่เพิ่งเชื่อมสำเร็จ **When** ระบบเช็ค `GET /{page-id}?fields=instagram_business_account` แล้วพบว่ามีผูกอยู่ **Then** สร้าง `ShopChannel` ใหม่ `provider = "INSTAGRAM"` โดยใช้ page access token เดียวกัน (ไม่ต้องขอ OAuth เพิ่ม)
- [ ] `[FR-FBC-10-AC-02]` **Given** Page ที่เชื่อมไม่มี IG Business Account ผูกอยู่ **When** ตรวจสอบ **Then** ไม่สร้าง `ShopChannel` ฝั่ง IG (ไม่ error, ข้าม step นี้เงียบ ๆ)

#### FR-FBC-11: จัดการ/ถอด Page ที่เชื่อมแล้ว

**User Story:** ในฐานะ Seller ฉันต้องการเห็นสถานะ Page ที่เชื่อมไว้ทั้งหมดและถอดการเชื่อมได้เมื่อต้องการ เพื่อควบคุมว่าช่องทางไหนยังใช้งานอยู่

**Acceptance Criteria:**
- [ ] `[FR-FBC-11-AC-01]` `/seller/settings/channels` แสดงรายการ `ShopChannel` ทั้งหมดของร้าน (Messenger + Instagram) พร้อมสถานะ (`ACTIVE`/`TOKEN_INVALID`/`DISCONNECTED`)
- [ ] `[FR-FBC-11-AC-02]` **Given** Seller กดถอดการเชื่อม Page **When** ยืนยัน **Then** ตั้ง `status = "DISCONNECTED"` — หยุดรับ/ส่งข้อความช่องทางนั้นทันที โดยไม่ลบประวัติเธรดเดิมที่มีอยู่แล้ว
- [ ] `[FR-FBC-11-AC-03]` **Given** `ShopChannel.status = "TOKEN_INVALID"` **When** Seller เห็นหน้านี้ **Then** แสดงแบนเนอร์ชัดเจนพร้อมปุ่มเชื่อมต่อใหม่

---

### 2.6 การแสดงผลใน Inbox

#### FR-FBC-12: Badge ช่องทาง + filter ตาม Page ใน `/inbox`

**User Story:** ในฐานะ Seller ที่เชื่อมหลาย Page ฉันต้องการแยกแยะได้ว่าข้อความมาจากช่องทางไหน เพื่อเข้าใจบริบทลูกค้าได้เร็ว

**Acceptance Criteria:**
- [ ] `[FR-FBC-12-AC-01]` แต่ละแถวใน `/inbox` แสดง icon ช่องทาง (`tabler-brand-messenger` / `tabler-brand-instagram`) เมื่อ `channel != "DEEP"` — ไม่ใช้ emoji (Hard Rule 12)
- [ ] `[FR-FBC-12-AC-02]` Seller กรองรายการเฉพาะ Page ใด Page หนึ่งได้ — filter แสดงเฉพาะ `ShopChannel` ของร้านตนเอง
- [ ] `[FR-FBC-12-AC-03]` เธรด `channel = "DEEP"` (Deep Chat เดิม) แสดงผลเหมือนเดิมทุกประการ ไม่มี badge ช่องทางเพิ่ม (zero regression)

---

## 3. Acceptance Criteria สรุป

### 3.1 Inbound & Echo
- ข้อความ TEXT/IMAGE จากลูกค้าปรากฏใน `/inbox` ครบ ไม่ตก ไม่ซ้ำจาก redelivery
- Signature ไม่ผ่าน → ปฏิเสธ 401 ไม่บันทึกข้อมูล
- ข้อความ echo บันทึกเป็นฝั่งร้านถูกต้อง ไม่สร้างเธรดซ้ำ

### 3.2 Outbound & Window
- ส่งข้อความออกสำเร็จผ่าน Send API แล้วค่อยเขียน DB (ลำดับถูกต้อง)
- หน้าต่าง 24 ชม. บังคับได้จริง — ปิดช่องพิมพ์ก่อนกดส่ง ไม่ปล่อย error หลังกด
- ส่งไม่สำเร็จด้วยเหตุอื่นแสดงในเธรดตรง ๆ ไม่ fail เงียบ

### 3.3 Order & Customer Linking
- สร้างออเดอร์จากเธรดบังคับกรอกเบอร์เมื่อยังไม่เคยผูก Customer
- ผูก ExternalContact.customerId ครั้งเดียว ใช้ซ้ำได้ครั้งถัดไป

### 3.4 Channel Management
- เชื่อม Page ได้เฉพาะที่มีสิทธิ์ MESSAGING+MODERATE
- 1 Page ผูกได้ร้านเดียวทั้งระบบ — เชื่อมซ้ำถูกปฏิเสธพร้อมข้อความชัดเจน
- ถอดการเชื่อม/token ตายสะท้อนสถานะถูกต้องในหน้า channels

### 3.5 Zero Regression
- เธรด `DEEP` เดิมทำงานเหมือนเดิมทุกประการ
- buyer app (`/messages`) ไม่มีการเปลี่ยนแปลงใด ๆ

---

## 4. Business Flows (กระบวนการทำงาน)

### 4.1 Flow หลัก: Webhook ขาเข้า → เข้า Inbox
