---
title: "00068 — ข้อเท็จจริง LINE Messaging API ที่ยืนยันแล้ว"
created: 2026-10-05
status: verified
---

# ข้อเท็จจริง LINE Messaging API (ยืนยันจากเอกสารทางการ 2026-10-05)

> ตาม convention `external-payload-schema` — SRS/DATABASE/API ของ 00068 ต้องอ้างไฟล์นี้ ไม่ใช่ความจำ
> ยังต้องพิสูจน์ซ้ำด้วย payload จริงจาก OA ทดสอบก่อนล็อก validator (เก็บ payload ดิบก่อน validator)

แหล่ง: REF = https://developers.line.biz/en/reference/messaging-api/ · GROUPS = https://developers.line.biz/en/docs/messaging-api/group-chats/ · PRICING = https://developers.line.biz/en/docs/messaging-api/pricing/ · RETRY = https://developers.line.biz/en/docs/messaging-api/retrying-api-request/

## 1. Webhook event ในกลุ่ม (REF)

| event | replyToken | source | หมายเหตุ |
|---|---|---|---|
| `join` | มี | `{type:"group", groupId}` | ยิงเมื่อมีคนเชิญ OA เข้ากลุ่ม |
| `leave` | **ไม่มี** | `{type:"group", groupId}` | ยิงทั้งตอนถูกเตะ และตอน OA ออกเอง (เช่น เราสั่ง leave) |
| `memberJoined` | มี | group ไม่มี userId | `joined.members[]` — ฟีเจอร์นี้ไม่ใช้ |
| `message` | มี | `{type:"group", groupId, userId?}` | 🛑 `userId` **optional** — validator ห้ามบังคับ |

- ทุก event มี `mode` (`active`/`standby`) — **standby ไม่มี replyToken** · `webhookEventId` (ULID) ใช้ dedupe · `deliveryContext.isRedelivery`

## 2. ข้อมูลกลุ่ม

- `GET /v2/bot/group/{groupId}/summary` → `{groupId, groupName, pictureUrl?}` — ใช้ดึงชื่อกลุ่มตอนผูก
- `GET /v2/bot/group/{groupId}/members/count` → `{count}` (ไม่รวม OA, รวมคนที่บล็อก) — ใช้ประมาณต้นทุนต่อรอบ
- ทั้งสองตัว: 404 `Not found` เมื่อ OA ไม่อยู่ในกลุ่มแล้ว · ไม่ต้องใช้แผน verified/premium (ต่างจาก `/members/ids`)
- `POST /v2/bot/group/{groupId}/leave` → 200 `{}` · 404 ถ้าไม่อยู่ในกลุ่ม

## 3. Push + retry key

- `POST /v2/bot/message/push` `{to, messages}` — `messages` **≤ 5** ต่อคำขอ (รายวัน + รายเดือนใน push เดียวใช้ได้)
- `X-Line-Retry-Key` ต้องเป็น **UUID (hex)** ⇒ ใช้ UUIDv5 ที่ได้จาก `(groupId, slotKey)` เพื่อให้คงที่ข้าม retry
  - ต้องใส่ตั้งแต่คำขอแรก · กันซ้ำได้ **24 ชม.** · ซ้ำ → **409** + `sentMessages` (ถือว่า SENT)
  - retry เฉพาะ 500/timeout · เนื้อหา retry ต้อง **เหมือนเดิมทุกไบต์** ⇒ 🛑 ขัดกับร่าง AC-LGS-20-5 ("retry คำนวณตัวเลขใหม่") — ถ้าคำนวณใหม่ต้องใช้ retry key ใหม่ (= ยอมความเสี่ยงส่งซ้ำ) หรือเก็บ payload เดิมแล้วส่งซ้ำ → SRS ต้องตัดสิน (แนะนำ: เก็บ payload เดิม ส่งซ้ำด้วย key เดิมเมื่อสาเหตุคือ 500/timeout)
- push ไปกลุ่มที่ OA ไม่อยู่ → **400** `Failed to send messages` (ข้อความกลาง ใช้แยกสาเหตุไม่ได้) ⇒ เมื่อได้ 400 ให้ยืนยันด้วย `GET .../summary` (404 = บอทไม่อยู่แล้ว → INACTIVE)

## 4. Reply token

- ใช้ได้ **ครั้งเดียว** ภายใน **1 นาที** (redelivery: ภายใน 1 นาทีของการส่งซ้ำ และไม่เกิน 20 นาทีจาก event) — ใช้ retry key กับ reply ไม่ได้ (400)

## 5. ต้นทุน

- push เข้ากลุ่มนับ **ตามจำนวนผู้รับในกลุ่ม** ไม่ใช่จำนวน message object (ตัวอย่าง LINE: 4 objects → ห้อง 5 คน = 5) · ไม่นับคนที่บล็อก
- **reply ไม่นับโควตา**
- แผนไทย (ไม่รวม VAT 7%): ฟรี 300 ข้อความ/เดือน · เบสิก ฿1,280 = 15,000 (+฿0.1) · โปร ฿1,780 = 35,000 (+฿0.06) ⇒ แผนฟรีไม่พอแม้ลูกค้ารายเดียว (10 คน × 2 รอบ × 30 วัน = 600) — OA กลางต้องเป็นแผนเสียเงินตั้งแต่วันแรก
- UNCONFIRMED: นับ OA เองเป็นผู้รับหรือไม่ · โควตา "broadcast" ในหน้าไทยคือ pool เดียวกับ push หรือไม่ (น่าจะใช่)

## 6. Flex

- `altText` ≤ **1500** ตัวอักษร · bubble ≤ **30 KB** · carousel ≤ 50 KB / 12 bubbles · text component ไม่มีเพดานตัวอักษรในเอกสาร (ใช้ `maxLines`)

## 7. Console

- "Allow bot to join group chats" อยู่แท็บ Messaging API — **ปิดเป็นค่าตั้งต้น** ต้องเปิดก่อน · กลุ่มหนึ่งมี OA ได้ตัวเดียว (ถ้ากลุ่มมี OA ของร้านอยู่แล้ว ต้องเอาออกก่อน — ต้องบอกในหน้าผูกกลุ่ม)
