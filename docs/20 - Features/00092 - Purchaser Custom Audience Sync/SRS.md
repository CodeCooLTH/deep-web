---
title: "SRS — 00092 ส่งรายชื่อลูกค้าที่ซื้อแล้วเข้า Custom Audience ของ Meta"
owner: shinobu22
status: backend-implemented
created: 2026-11-14
tags: [feature, srs, meta, ads, custom-audience]
related: ["[[PRD]]", "[[BRD]]", "[[SDS]]", "[[API]]", "[[DATABASE]]", "[[TestCase]]"]
---

> เขียนจากโค้ดฝั่ง backend (UI ยังไม่ทำ — งานแยกรอบถัดไป) · ขอบเขตโค้ด: `src/lib/meta-audience/*` · `src/services/meta-audience*.service.ts` · `src/app/api/{shops/meta-audience,meta-audience,cron/meta-audience}/**`

# SRS: Custom Audience ลูกค้าที่ซื้อแล้ว (00092)

## 1. ข้อกำหนดเชิงฟังก์ชัน ↔ โค้ด

| FR | สิ่งที่โค้ดทำ | ที่ |
|---|---|---|
| FR-001 สวิตช์ระบบ | `OPEN_META_AUDIENCE=1` เท่านั้นที่เปิด · `META_AUDIENCE_PILOT_SHOP_IDS` จำกัดร้าน · ปิด = hook ไม่เขียน · cron ข้าม · API 404 | `lib/meta-audience/gate.ts` |
| FR-002 เชื่อมบัญชีโฆษณา | OAuth (`ads_management` เฉพาะ role) → เลือกบัญชีจาก `/me/adaccounts` · หรือกรอก Ad Account ID + System User token · ตรวจกับ Meta ก่อนเก็บ · token เข้ารหัส ไม่ออก client | `lib/meta-audience/oauth.ts` · `meta-audience-settings.service.ts` · routes |
| FR-002 ข้อตกลง | error ของ Meta "Custom Audience Terms Not Accepted" → หยุดร้าน เหตุผล `TERMS_NOT_ACCEPTED` + `termsUrl` ในสถานะ | `lib/meta-audience/classify.ts` |
| FR-002 token ใกล้หมด | `tokenExpiresAt` < 7 วัน → push เจ้าของครั้งเดียว (`expiryWarnedAt`) ใน cron | `sweepMetaAudience` |
| FR-003 สร้าง audience | cron สร้างเมื่อ `audienceId` ว่าง (ชื่อ `Deep · ลูกค้าที่ซื้อแล้ว · {ชื่อร้าน}`) · Meta บอกว่า audience หาย → สร้างใหม่ + ทุกแถวกลับเป็นยังไม่ส่ง | `syncConnection` |
| FR-004 เพิ่ม | hook หลัง commit ผ่าน `enqueueOrderCapiAfterCommit` (จุดเรียกเดียวกับ CAPI) → ตัวตน PSID+เพจ / เบอร์แฮช → `desired=IN` | `markOrderPurchaserAfterCommit` |
| FR-005 ถอน | CANCELED/RETURNED → คำนวณใหม่จากใบทั้งหมดของตัวตนในร้านนี้ · ไม่มีใบที่นับ → `desired=OUT` | `recomputeIdentity` |
| FR-006 ส่งเป็นชุด | cron ทุก 5 นาที · ≤10,000/คำขอ · ล้มชั่วคราว backoff · STOP หยุดร้าน + push · ร้านอื่นไม่ถูกบล็อก | `sweepMetaAudience` · `sendBatches` |
| FR-007 เติมย้อนหลัง | `backfilledAt` ว่าง → รอบ cron แรกหลังเปิดใช้เติมทุกใบที่ถึงจังหวะ Purchase | `backfillShopAudience` |
| FR-008 หน้าตั้งค่า | **ยังไม่ทำ (UI)** — API สถานะ/เปิด-ปิด/เชื่อม/ตัด พร้อมแล้ว (ดู API.md) | — |

## 2. กฎธุรกิจ ↔ ที่บังคับ

| กฎ | บังคับที่ | เทส |
|---|---|---|
| BR-CA-01 ส่งแค่ PSID+เพจ / เบอร์แฮช | `buildUsersPayload` ส่งเฉพาะ `schema+data(+page_ids)` · DB เก็บแต่แฮช | `ตัวส่ง … ไม่มีเบอร์ดิบ/token ใน body` |
| BR-CA-02 "ซื้อแล้ว" = จังหวะ Purchase เดียวกับ 00089 | hook ใช้ `eventsForTrigger` ของ 00089 ตัดสินทริกเกอร์ · `isCountedOrder` ใช้ `purchaseAt` จาก `MetaCapiPageSetting` เดียวกัน · ไม่มีค่าตั้ง = `PAYMENT` | `meta-audience.test.ts` · hook tests |
| BR-CA-03 ถอนเฉพาะเมื่อไม่มีใบอื่นที่นับ | `recomputeIdentity` นับทุกใบของตัวตนในร้านเดียวกัน (เบอร์เทียบแฮช ไม่ใช่ข้อความดิบ) | `ยกเลิกใบหนึ่งแต่ยังมีใบอื่น…` · `ใบของร้านอื่น…` |
| BR-CA-04 ปิดใช้ไม่ลบ audience | `setAudienceEnabled(false)` แค่ปิดสวิตช์ · ไม่มีการเรียก DELETE audience ที่ใดเลย | `ปิดใช้ไม่ลบอะไร` |

## 3. การตัดสินใจที่ควรรู้ (จากโค้ด ไม่ใช่ PRD)

1. **จังหวะ Purchase ของใบนอกแชท:** ใบที่ไม่มีห้อง Messenger ใช้ `purchaseAt` ของเพจแรกของร้านที่มีค่าตั้ง 00089 (ตามเวลาสร้าง) · ร้านไม่มีค่าตั้งเลย = `PAYMENT` — ร้านหลายเพจที่ตั้งจังหวะต่างกันจะได้ผลของเพจแรกสำหรับใบนอกแชท
2. **`countPromotedDraft` ไม่มีผลกับ audience:** ใบที่ยืนยันจากร่างเป็นใบจริง นับเป็นลูกค้าที่ซื้อ (CAPI ใช้ธงนี้กันซ้ำกับ Lead ไม่ใช่เรื่อง audience)
3. **"ชำระครบ"** = `computeOrderMoney.fullyPaid` หรือ `paymentConfirmedAt` หรือ `codReceivedAt` — ตรงกับจุดที่ระบบยิง `FULLY_PAID`
4. **เบอร์ที่ไม่ใช่เบอร์ไทย 10 หลัก (`^0\d{9}$`) ไม่ถูกส่ง** (แมตช์ไม่ได้อยู่แล้ว)
5. **คัดกรองเบอร์ของใบอื่นด้วย `buyerContact contains <4 หลักท้าย>` แล้วเทียบแฮชใน JS** — shortcut: ถ้าเบอร์ถูกคั่นกลาง 4 หลักท้าย (เช่น `08-12345-678`) จะหลุด และใบนั้นไม่ช่วยค้ำ (ผลคือถอนเร็วเกินไปได้ในกรณีหายาก)
6. **hook ทำงานเมื่อมี connection แม้ยังไม่ `enabled`** — เพื่อให้เปิดทีหลังไม่ขาดช่วง · ตัวส่งส่งเฉพาะ `enabled && ACTIVE`
7. **`schema` ของ PSID = `UID` + `page_ids`** (ค่าคงที่ `UID_SCHEMA` ที่เดียว) — ยังไม่เคยยิง Meta จริง; รหัส error ข้อตกลง (subcode 1870090) และ audience-หาย (subcode 33 / code 803) ก็ยังไม่ยืนยันจริง (มีตัวสำรองด้วยข้อความ)
8. **scope `ads_management`/`ads_read` อยู่ใน `PENDING_REVIEW_SCOPES` เท่านั้น** (OAuth เชื่อมเพจของบัญชีที่มี role จะขอเพิ่ม) · OAuth เชื่อมบัญชีโฆษณาขอเฉพาะ `ads_management` (`ADS_SCOPES`) และ **ปฏิเสธคนนอก role** (403 `NOT_ROLE_USER`) — ทางที่เหลือสำหรับคนนอก role คือกรอก token เอง

## 4. สิ่งที่ต้องทำนอกโค้ด
- เปิดสิทธิ์ `ads_management` ใน App Dashboard (Standard) และเพิ่ม redirect URI `https://{seller-host}/api/meta-audience/callback`
- ตั้ง env `OPEN_META_AUDIENCE=1` + `META_AUDIENCE_PILOT_SHOP_IDS` (ร้านธนภัทร์) บน prod
- migration `20261114110000_00092_purchaser_audience` ขึ้นพร้อม push `main` (HR15 — additive · prod ไม่ต้องสั่ง · local ต้อง apply เอง · ล้ม = deploy ไม่ขึ้น)

## 5. นอกขอบเขตรอบนี้
UI การ์ดตั้งค่า (FR-008) · Instagram · value-based audience · สร้าง Lookalike
