---
title: "API Contract — 00066 ติดตามลูกค้า"
owner: shinobu22
status: draft
created: 2026-09-29
tags: [feature, api, 00066]
related: ["[[SDS]]", "[[SRS]]", "[[BRD]]"]
---

> **ประเภท:** API Contract · **เวอร์ชัน:** 0.1 · **วันที่:** 2026-09-29 · **สถานะ:** Draft · **เจ้าของ:** SA

# API Contract: ติดตามลูกค้า

## 1. Overview
Provider: Next.js 16 Route Handlers ในรีโปนี้ · ผู้บริโภค: client component ของ `(paces)/seller/**` (และ WebView ของแอปผู้ขาย) · Base: `/api` (subdomain `seller.*` ตาม `proxy.ts`) · `Content-Type: application/json` · ทุก response ตั้ง `Cache-Control: private, no-store, max-age=0, must-revalidate` และ `export const dynamic = 'force-dynamic'` (แพตเทิร์น `crm/route.ts:11-12`) · โครง error ของโปรเจกต์คือ `{ "error": string }` — ฟีเจอร์นี้เพิ่ม `code` (backward-compatible) ให้ client แยกกรณีได้

## 2. Authentication
| รายการ | ค่า |
|---|---|
| วิธี | NextAuth session cookie (แยกตาม subdomain) |
| ตัวตน | `sessionUserId(session)` เท่านั้น (`src/lib/session-user.ts:20`) — ไม่มี id ⇒ 401 |
| ร้าน | ไม่รับ `shopId` เป็นสิทธิ์: resolve จากห้อง/รายการใน WHERE; `?shopId=` ที่ client ส่ง (board) ต้อง intersect กับ `scope.shopIds` (`intersectScopedShopIds` `chat-scope.ts:166`) ค่านอกขอบเขต = ไม่กรอง/ผลว่าง ห้าม 403 |
| CSRF/rate-limit | `guardApi` ใน `proxy.ts` (mutation ต้อง Origin ตรง; 30 req/นาที/ผู้ใช้ล็อกอิน) |
| cron | `Authorization: Bearer ${CRON_SECRET}` — env ว่าง = 401 |

## 3. Endpoint List
| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/api/chat/conversations/{id}/follow-ups` | รายการของแผงห้อง (ขอบเขต cluster) |
| POST | `/api/chat/conversations/{id}/follow-ups` | สร้างรายการ |
| PATCH | `/api/follow-ups/{id}` | แก้ไข |
| DELETE | `/api/follow-ups/{id}` | ลบ |
| POST | `/api/follow-ups/{id}/complete` | ปิดงาน |
| POST | `/api/follow-ups/{id}/reopen` | เปิดกลับ |
| POST | `/api/follow-ups/{id}/snooze` | เลื่อน |
| GET | `/api/follow-ups/mine` | ข้อมูล bubble |
| GET | `/api/follow-ups/board` | กระดาน / ปฏิทิน |
| GET | `/api/cron/follow-up-reminders` | cron เตือน |
| (แก้เดิม) GET | `/api/chat/conversations?followUp=late,upcoming,done` | ตัวกรองกล่องแชท + `followUpCounts` ในทุก item |

## 4. Endpoint Detail
### 4.0 ชนิดร่วม
```ts
FollowUpDto = {
  id: string; conversationId: string; shopId: string
  type: 'FOLLOW_UP'|'MEET_CUSTOMER'|'OTHER'
  title: string; note: string|null
  dueAt: string            // ISO instant
  allDay: boolean          // true ⇒ UI แสดงเฉพาะวัน (BR-ACT-03)
  status: 'OPEN'|'DONE'; outcome: 'REACHED'|'NO_ANSWER'|'CALL_LATER'|'NOT_INTERESTED'|null
  doneAt: string|null; doneBy: PersonDto|null
  snoozeCount: number
  assignee: PersonDto|null   // null = ยังไม่มีคนรับ
  assigneeRemoved: boolean   // มี assigneeUserId แต่ไม่ใช่สมาชิกแล้ว ⇒ UI "ทีมงานที่ถูกถอดออกแล้ว"
  createdBy: PersonDto|null
  bucket: 'late'|'today'|'week'|'later'|'done'   // คำนวณโดย bucketOf ฝั่ง server ด้วย now ของ server
  overdue: boolean
  room: { id: string; label: string; channel: string } | null  // ไม่ null เมื่อมาจากห้องอื่นใน cluster
  customerName: string|null; customerAvatar: string|null       // สำหรับ bubble/กระดาน (alias ชนะชื่อจริง)
}
PersonDto = { userId: string; name: string; avatar: string|null }   // ชื่อฟิลด์รูปของ User ต้องเปิด schema ยืนยัน [ยังไม่ยืนยัน]
```
`note` ส่งกลับเฉพาะ endpoint ที่ผู้ใช้เปิดรายการนั้นได้ (ทุกตัวข้างต้น) — ไม่ส่งใน payload push.

### 4.1 `GET /api/chat/conversations/{id}/follow-ups`
| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|---|---|---|---|---|
| Path | `id` | uuid | ✓ | ห้อง |
**200:** `{ open: FollowUpDto[]; recentDone: FollowUpDto[] (≤3); openCount: number; lateCount: number; expanded: boolean; truncated: boolean; assignees: PersonDto[] | null }` — `assignees=null` เมื่อร้าน PERSONAL (UI ไม่แสดงตัวเลือกคน) · `expanded` = `panelModel` (กางเองเมื่อ lateCount≥1)
**Error:** 400 id ไม่ใช่ uuid · 401 · 404 (ไม่มี/ไม่ใช่ของสิทธิ์)

### 4.2 `POST /api/chat/conversations/{id}/follow-ups`
Body: `title` (string 1–200 หลัง trim ✓) · `type` (`FOLLOW_UP|MEET_CUSTOMER|OTHER`, ตั้งต้น FOLLOW_UP) · `date` (`YYYY-MM-DD` เวลาไทย ✓) · `time` (`HH:mm`|null ✓ null=ทั้งวัน) · `note` (≤1000, optional/null) · `assigneeUserId` (uuid, optional — ไม่ส่ง = ผู้สร้าง)
**201:** `{ item: FollowUpDto }`
**Error:** 400 `VALIDATION` / `INVALID_DUE` / `ASSIGNEE_NOT_MEMBER` · 401 · 404 `NOT_FOUND`
```json
// Request
{ "title": "ถามลูกค้าว่าตัดสินใจหรือยัง", "type": "FOLLOW_UP", "date": "2026-09-30", "time": "10:00" }
// Response 201
{ "item": { "id": "…", "dueAt": "2026-09-30T03:00:00.000Z", "allDay": false, "status": "OPEN", "bucket": "week", "snoozeCount": 0 } }
```
(10:00 ไทย = 03:00Z)

### 4.3 `PATCH /api/follow-ups/{id}`
Body (ทุกฟิลด์ optional; `undefined`=ไม่แตะ): `title` `type` `note` (null ล้างได้) `date`+`time` (ต้องมี `date` คู่กัน; `time` null=ทั้งวัน) `assigneeUserId` (uuid — **ห้าม null**)
เมื่อ `status=DONE` อนุญาตเฉพาะ `title`,`note`. **200** `{ item }` · **Error:** 400 `VALIDATION/INVALID_DUE/ASSIGNEE_NOT_MEMBER` · 401 · 404 · 409 `INVALID_STATE`. แก้เวลา = re-arm เตือน ไม่เพิ่ม `snoozeCount`.

### 4.4 `POST /api/follow-ups/{id}/complete`
Body: `{ "outcome": "REACHED"|"NO_ANSWER"|"CALL_LATER"|"NOT_INTERESTED"|null }` (null = "ข้าม") — **200** `{ item }` · idempotent: ปิดแล้วคืนแถวเดิม ไม่เขียนผู้ปิดทับ · 400 · 401 · 404.

### 4.5 `POST /api/follow-ups/{id}/reopen`
Body ว่าง `{}` · **200** `{ item }` (เปิดอยู่แล้วก็ 200) · 401 · 404.

### 4.6 `POST /api/follow-ups/{id}/snooze`
Body หนึ่งในสอง: `{ "preset": "TOMORROW_9"|"IN_3_DAYS"|"NEXT_WEEK" }` หรือ `{ "date": "YYYY-MM-DD", "time": "HH:mm"|null }` · **200** `{ item }` (`snoozeCount`+1) · 400 `VALIDATION/INVALID_DUE` · 401 · 404 · 409 `INVALID_STATE` (รายการปิดแล้ว)

### 4.7 `DELETE /api/follow-ups/{id}`
**200** `{ ok: true }` · 401 · 404 (client ถือว่าสำเร็จ — ลบซ้ำจาก 2 แท็บ E18) · UI ต้องผ่าน `pacesConfirm.danger` ก่อนเรียก.

### 4.8 `GET /api/follow-ups/mine`
Query: `shopId?` (intersect กับขอบเขต) — ขอบเขตร้าน = `scope.shopIds` (มติ Q5: ทุกร้านที่กำลังดู)
**200:** `{ rows: FollowUpDto[] (≤8, late ก่อน today, เรียง dueAt), total: number, lateCount: number, tone: 'none'|'normal'|'late', href: '/follow-ups?mine=1' }` — `tone` จาก `bubbleModel` (none ⇒ UI ไม่แสดงปุ่ม) · 401 (UI render `null`).

### 4.9 `GET /api/follow-ups/board`
Query: `view` (`board`|`calendar`, ตั้งต้น board) · `mine` (`1`) หรือ `assignee` (`{userId}`|`unassigned`) · `tags` (CSV) · `q` (≤100, หน่วง 350ms ฝั่ง client) · `shopId?` · `month` (`YYYY-MM`, เมื่อ calendar) — ค่าที่ parse ไม่ได้ = ไม่กรอง (AC-ACT-25)
**200 board:** `{ columns: { late: FollowUpDto[]; today: …; week: …; later: …; done7d: … }, counts: { late, today, week, later, done7d, byUser: Record<userId,number>, unassigned: number }, truncated: boolean, assignees: PersonDto[]|null }` — `counts` คำนวณจาก OPEN scan **ก่อนใช้ตัวกรอง** (AC-ACT-26)
**200 calendar:** `{ items: FollowUpDto[] (≤1000), truncated: boolean, month: 'YYYY-MM' }` (ทุกสถานะ)
Error: 401 · 400 (เฉพาะ `view` ผิด) · ร้านนอกขอบเขต ⇒ ผลว่าง.

### 4.10 `GET /api/cron/follow-up-reminders`
Header `Authorization: Bearer CRON_SECRET`. **200** `{ ok: true, scanned, due, reserved, sent, noToken, failed, droppedNonMember }` · 401. Payload push:
```json
{ "title": "ติดตามลูกค้า", "subtitle": "ชื่อลูกค้า", "body": "หัวข้อรายการ (≤60 ตัวอักษร)",
  "data": { "type": "follow-up", "url": "/inbox/<conversationId>", "shopId": "…", "conversationId": "…", "followUpId": "…" } }
```
หลายรายการ: `body="มี n รายการถึงกำหนด"`, `url="/follow-ups?mine=1&shopId=…"`. **ห้าม** มี `note`/เบอร์.

### 4.11 แก้ `GET /api/chat/conversations`
เพิ่ม query `followUp` = CSV ของ `late|upcoming|done` (ค่าอื่นทิ้ง) และเพิ่มใน item: `followUp: { open: number; late: number }` (มาจาก `enrichWithFollowUpCounts`, ก้อนเดียว).

## 5. Error Code Table
| code | HTTP | เงื่อนไข |
|---|---|---|
| `VALIDATION` | 400 | Valibot ไม่ผ่าน (หัวข้อว่าง/ยาวเกิน/ชนิดผิด/รูปแบบวัน) |
| `INVALID_DUE` | 400 | วันไม่มีจริง/นอกช่วง [−365,+730] วัน |
| `ASSIGNEE_NOT_MEMBER` | 400 | ผู้รับผิดชอบไม่ใช่เจ้าของ/สมาชิกร้านของห้อง (รวม FK P2003) |
| `UNAUTHORIZED` | 401 | ไม่มี session user id |
| `NOT_FOUND` | 404 | ไม่มีรายการ/ห้อง หรือไม่ใช่ของร้านที่มีสิทธิ์ (ไม่แยกสองกรณี) |
| `INVALID_STATE` | 409 | เลื่อนรายการที่ปิด / แก้ฟิลด์ต้องห้ามตอนปิดแล้ว |
| — | 500 | ข้อความกลาง (log ฝั่ง server) |
โครง: `{ "error": "ข้อความไทย", "code": "…" }`. ข้อความ error ที่ผู้ใช้เห็นต้องมาจากพจนานุกรม i18n ฝั่ง client โดยใช้ `code` (server คืนข้อความไทยกลางเป็น fallback)

## 6. Sequence
ดู SDS §4.1 (สร้าง→เตือน→ปิด) และ §4.4 (ตัวกรองกล่องแชท)

## 7. Traceability
| Endpoint | SDS | BRD FR |
|---|---|---|
| GET/POST conversations/{id}/follow-ups | §4.2, TD-FU-1/6 | FR-ACT-01, 06 |
| PATCH/DELETE | §3, TD-FU-3 | FR-ACT-02, 05 |
| complete/reopen/snooze | §4.1 | FR-ACT-03, 04 |
| mine | TD-FU-7 | FR-ACT-07 |
| board | §4.3, TD-FU-2/8 | FR-ACT-08 |
| GET conversations?followUp | §4.3–4.4, TD-FU-9 | FR-ACT-10 |
| cron | §4.1, TD-FU-3/4 | FR-ACT-11 |

## 8. สรุป
สัญญาชัดพอให้ implement ได้โดยไม่ต้องเลือกรูปร่างใหม่ · **Open:** ชื่อฟิลด์รูปของ `User` (ต้องเปิด schema) · `code` ใน error เป็นส่วนขยายจาก `{error}` เดิมของโปรเจกต์
