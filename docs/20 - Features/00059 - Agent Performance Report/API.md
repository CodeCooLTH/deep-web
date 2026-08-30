---
title: "API — รายงานผลงานแอดมิน"
owner: shinobu22
status: draft
created: 2026-08-26
tags: [feature, 00059, api]
related: ["[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M59-AgentPerformance
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-26

# API: รายงานผลงานแอดมิน

---

## 0. หลักที่ยึด

- อยู่ใต้ `/api/seller/**` ตามแพตเทิร์นเดิมของโปรเจกต์ (เทียบ `/api/seller/sales-series`)
- 🛑 **ไม่รับ `shopId` จาก query เด็ดขาด** — ร้านมาจาก session เท่านั้น ⇒ ได้ membership guard ฟรี
  และไม่มีทางยิงข้ามร้านแม้รู้ id
- ทุก response `cache-control: private, no-store` (ข้อมูลต่อผู้ใช้ — `feedback_auth_api_cache_control`)
- ทุก route `export const dynamic = 'force-dynamic'`

---

## 1. Query parameters (ใช้ร่วมกันทุก endpoint)

| ชื่อ | รูปแบบ | ค่าตั้งต้น | หมายเหตุ |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | 7 วันล่าสุด | เที่ยงคืนเวลาไทย · รวมวันนี้ |
| `to` | `YYYY-MM-DD` | วันนี้ | **รวม** วันนี้ (ระบบแปลงเป็น `[from, to+1)` ภายใน) |
| `channel` | `DEEP` \| `MESSENGER` \| `INSTAGRAM` \| `LINE` | ทุกช่องทาง | ค่าที่ไม่รู้จักถูกละทิ้ง (ไม่ใช่ 400) |
| `source` | `ADS` \| `SHORTLINK` \| `DIRECT` | ทุกที่มา | `DIRECT` = ไม่มี referral |
| `shopChannelId` | uuid | ทุกเพจ/บัญชี | |

**พฤติกรรมของค่าที่ผิดรูป:** ละทิ้งแล้วใช้ค่าตั้งต้น ไม่ตอบ 400
เหตุผล: ตัวกรองอยู่ใน URL ที่ผู้ใช้ส่งต่อกันได้ ลิงก์ที่พิมพ์ผิดควรได้หน้าที่ใช้งานได้ ไม่ใช่หน้า error
ส่วนช่วงที่ยาวเกินเพดานจะถูก **หั่นพร้อมแจ้ง** ผ่าน `clamped: true`

---

## 2. `GET /api/seller/reports/agents`

ภาพรวม + ตารางจัดอันดับ

**200**
```jsonc
{
  "range": { "from": "2026-08-19T17:00:00.000Z", "to": "2026-08-26T17:00:00.000Z" },
  "sla": { "firstResponseSec": 300, "source": "SYSTEM_DEFAULT" },
  "overview": {
    "conversations": 128,
    "qualifiedConversations": 96,
    "convertedConversations": 31,
    "conversionRatePct": 32.3,
    "ordersCreated": 38,
    "revenue": 184300,
    "firstResponseAvgSec": 214,
    "firstResponseMedianSec": 96,
    "responseAvgSec": 301,
    "responseMedianSec": 122,
    "responseSampleCount": 412,
    "slaRequired": 121,
    "slaWithin": 88,
    "slaPct": 72.7,
    "timeToCloseAvgSec": 5400,
    "unansweredConversations": 25,
    "answeredOutsideSystemConversations": 31,
    "unattributedReplyCount": 12,
    "repliedConversations": 96, "conversationsWithOrder": 40,
    "conversationsWithClosedOrder": 31, "ordersCreatedByOthers": 0
  },
  "previous": { /* โครงเดียวกัน — null = ช่วงก่อนหน้าไม่มีเธรดเลย */ },
  "leaderboard": [
    {
      "agentUserId": "…", "displayName": "ก้อย", "avatar": null, "isCurrentMember": true,
      "conversations": 54, "qualifiedConversations": 44, "convertedConversations": 18,
      "conversionRatePct": 40.9, "ordersCreated": 21, "revenue": 96500,
      "firstResponseAvgSec": 88, "firstResponseMedianSec": 61,
      "responseAvgSec": 143, "responseMedianSec": 90, "responseSampleCount": 210,
      "slaRequired": 44, "slaWithin": 39, "slaPct": 88.6, "timeToCloseAvgSec": 4200,
      "unansweredConversations": 0, "answeredOutsideSystemConversations": 0,
      "unattributedReplyCount": 0,
      // เส้นทาง "ตอบแชท → เปิดบิล" — ตอบว่า "ใครมีส่วนในยอด" (คนละคำถามกับ "ใครได้เครดิต")
      "repliedConversations": 54, "conversationsWithOrder": 24,
      "conversationsWithClosedOrder": 18, "ordersCreatedByOthers": 2
    }
  ],
  "agents": [ { "userId": "…", "displayName": "ก้อย", "avatar": null, "isCurrentMember": true } ],
  "channels": [ { "id": "…", "name": "BT Premium", "provider": "MESSENGER" } ],
  "label": { "from": "2026-08-20", "to": "2026-08-26" },
  "clamped": false,
  "access": { "kind": "FULL", "canSeeRevenue": true, "userId": "…" }
}
```

**หมายเหตุที่ผู้เรียกต้องรู้**
- ทุกฟิลด์ที่เป็นเวลา/อัตราเป็น `number | null` — **`null` แปลว่า "ไม่มีตัวอย่าง" ไม่ใช่ 0**
- `answeredOutsideSystemConversations` = แชทที่ถูกตอบจากนอกระบบล้วน ๆ (Business Suite)
  **ไม่ถูกนับทั้งตัวตั้งและตัวหารของทุกตัวชี้วัด** แต่ต้องแสดงจำนวนนี้บนหน้าจอเสมอ
- `ordersCreatedByOthers > 0` คู่กับ `ordersCreated === 0` = คนนี้คุยแต่ไม่ได้เปิดบิลเอง
- `access.kind = 'SELF'` → `leaderboard` มีแถวเดียว (ของตัวเอง) และ `overview` = ตัวเลขของตัวเอง
  ไม่ใช่ของทั้งร้าน · `revenue` ถูกตัดเป็น `null`
- ผลรวม `conversations` ของทุกแถวอาจ **มากกว่า** `overview.conversations` (เธรดที่ช่วยกันตอบ)
  ส่วนผลรวม `revenue`/`ordersCreated` ตรงกับภาพรวมเสมอ

**สถานะอื่น:** `401` ไม่ได้ล็อกอิน · `404` ไม่มีร้าน · `500` โหลดไม่สำเร็จ

---

## 3. `GET /api/seller/reports/agents/{agentId}`

ผลงานรายคน + แนวโน้มรายวัน

**200**
```jsonc
{
  "agent": { "userId": "…", "displayName": "ก้อย", "avatar": null, "isCurrentMember": true },
  "metrics": { /* โครงเดียวกับ overview */ },
  "previous": { /* หรือ null */ },
  "trend": [
    { "day": "2026-08-20", "conversations": 8, "responseAvgSec": 96,
      "orders": 3, "conversionRatePct": 37.5, "revenue": 12800 }
  ],
  "sla": { "firstResponseSec": 300, "source": "SYSTEM_DEFAULT" },
  "label": { "from": "2026-08-20", "to": "2026-08-26" },
  "clamped": false,
  "access": { "kind": "FULL", "canSeeRevenue": true }
}
```

- `trend` มีครบทุกวันในช่วง รวมวันที่ไม่มีข้อมูล (ค่าเป็น 0 / `null`) — กราฟจะได้ไม่ยุบวัน
- `responseAvgSec: null` ในวันหนึ่ง = วันนั้นไม่มีรอบการรอที่วัดได้ ⇒ กราฟต้องเว้นช่อง **ห้ามลากเป็น 0**

**403** — `access.kind = 'SELF'` แล้วขอ id ของคนอื่น
**404** — ไม่พบสมาชิกคนนี้ในร้าน

---

## 4. `GET /api/seller/reports/agents/{agentId}/conversations`

รายการบทสนทนาที่ประกอบเป็นตัวเลข · `agentId = 'all'` = ทุกเธรดในขอบเขต
(สงวนคำว่า `all` ได้เพราะ id จริงเป็น uuid)

**เพิ่ม query:** `limit` (1–100, default 25) · `offset` (default 0)

**200**
```jsonc
{
  "rows": [
    {
      "conversationId": "…",
      "customerName": "คุณเอ",
      "channel": "MESSENGER",
      "source": "ADS",
      "assignedAgentUserId": "…",
      "startedAt": "2026-08-21T04:12:00.000Z",
      "firstResponseSec": 74,
      "durationSec": 5400,
      "orderNo": "DP25690800A1B2C3D4",
      "orderValue": 1290,
      "result": "CONVERTED"
    }
  ],
  "total": 54,
  "limit": 25,
  "offset": 0,
  "canSeeRevenue": true
}
```

- `result`: `CONVERTED` (มีใบที่นับเป็นยอดขาย) · `PENDING` (มีใบแต่ยังไม่นับ) · `NOT_CONVERTED` (ไม่มีใบ)
- `orderValue` เป็น `null` เสมอเมื่อ `canSeeRevenue = false` — **ตัดที่ payload ไม่ใช่ที่หน้าจอ**

---

## 5. สิ่งที่ไม่มีใน API นี้ (โดยตั้งใจ)

- ไม่มี `POST`/`PATCH` — รายงานอ่านอย่างเดียว
- ไม่มี endpoint ตั้งค่า SLA (โครงรองรับแล้วแต่ยังไม่มีหน้าจอ — ดู `agent-sla.ts`)
- ไม่มี export CSV
