---
title: "API — 00092 Custom Audience ลูกค้าที่ซื้อแล้ว"
owner: shinobu22
status: backend-implemented
created: 2026-11-14
tags: [feature, api, meta, ads, custom-audience]
related: ["[[SRS]]", "[[SDS]]"]
---

# API 00092

ทุก endpoint: `requireShopCapability(session,'X9')` (เจ้าของเท่านั้น · ร้าน active ของ session) · `dynamic = "force-dynamic"` · response `Cache-Control: private, no-store, max-age=0, must-revalidate` (ยกเว้น redirect) · ฟีเจอร์ปิด/ร้านนอกรายชื่อทดลอง = **404** `{error:"ไม่พบหน้านี้", code:"FEATURE_DISABLED"}` · ลงทะเบียนใน `src/lib/route-capabilities.ts` (`DECLARED`)

| เมธอด | path | หมายเหตุ |
|---|---|---|
| GET | `/api/shops/meta-audience` | สถานะ |
| PUT | `/api/shops/meta-audience` | body `{enabled: boolean}` → สถานะ |
| DELETE | `/api/shops/meta-audience` | ตัดการเชื่อม → `{ok:true}` |
| POST | `/api/shops/meta-audience/connect` | เลือกบัญชีโฆษณา/กรอก token → สถานะ |
| GET | `/api/shops/meta-audience/accounts` | บัญชีโฆษณาที่ OAuth token (พักใน cookie) เข้าถึงได้ |
| GET | `/api/meta-audience/connect` | เริ่ม OAuth (302 ไป Facebook) |
| GET | `/api/meta-audience/callback` | รับ code (302 กลับ `/settings/conversions-api?audience=…`) |
| GET | `/api/cron/meta-audience` | CRON · `Bearer CRON_SECRET` มิฉะนั้น 401 · ทุก 5 นาที |

## GET /api/shops/meta-audience
```json
{ "connection": null }
```
หรือ
```json
{ "connection": {
  "adAccountId": "111222333", "adAccountName": "บัญชีร้าน", "tokenSource": "OAUTH|MANUAL",
  "tokenExpiresAt": "ISO|null", "audienceId": "123|null", "audienceName": "Deep · ลูกค้าที่ซื้อแล้ว · ร้าน|null",
  "enabled": true, "enabledAt": "ISO|null", "backfilledAt": "ISO|null",
  "status": "ACTIVE|STOPPED", "stoppedReason": "TOKEN_OR_PERMISSION|TERMS_NOT_ACCEPTED|null",
  "lastSyncedAt": "ISO|null", "hasToken": true,
  "counts": { "synced": 0, "pending": 0 },
  "adsManagerUrl": "https://business.facebook.com/adsmanager/audiences?act=…&selected_audience_ids=…|null",
  "termsUrl": "https://business.facebook.com/ads/manage/customaudiences/tos/?act=…|null (มีเมื่อ TERMS_NOT_ACCEPTED)"
} }
```
ไม่มี `tokenEnc`/token ใด ๆ · `counts.synced` = ลูกค้าที่อยู่ใน audience ตามที่เรารู้ · `pending` = ค้างเพิ่ม/ถอน

## PUT — เปิด/ปิด
| ผล | เมื่อ |
|---|---|
| 200 สถานะ | สำเร็จ · เปิดครั้งแรกตั้ง `enabledAt` (cron เติมย้อนหลังรอบถัดไป ≤5 นาที) |
| 409 `NOT_CONNECTED` | ยังไม่เชื่อมบัญชีโฆษณา |
| 409 `CONNECTION_STOPPED` | สถานะ STOPPED (ขอเปิด) — ต้องเชื่อมใหม่ก่อน |
| 400 `INVALID_INPUT` | body ไม่ใช่ `{enabled:boolean}` |

ปิด = หยุดส่ง **ไม่ลบ audience ใน Meta** (BR-CA-04)

## POST /connect
body (Valibot `AudienceConnectSchema`):
- `{ "mode": "MANUAL", "adAccountId": "123456789" | "act_123456789", "token": "…" }` — ตรวจ `GET act_{id}?fields=name,account_status` ด้วย token ก่อนเก็บ · `tokenExpiresAt = null`
- `{ "mode": "OAUTH", "adAccountId": "…" }` — ใช้ token ใน cookie `fb_audience_pending` · ต้องอยู่ในรายการ `/me/adaccounts` · ใช้แล้วลบ cookie

เชื่อมซ้ำ = แทน token · เปลี่ยน `adAccountId` = ล้าง audience + ทุกแถวกลับเป็นยังไม่ส่ง (ตัวเก่าใน Meta ไม่ลบ) · เชื่อมใหม่ล้าง `STOPPED`

| code | HTTP | เมื่อ |
|---|---|---|
| `TOKEN_INVALID` | 400 | token ใช้ไม่ได้/ไม่มีสิทธิ์ |
| `AD_ACCOUNT_INVALID` | 400 | ตรวจบัญชีไม่ผ่าน/ไม่อยู่ในรายการ |
| `PENDING_EXPIRED` | 400 | (OAUTH) cookie หมดอายุ/ไม่มี |
| `INVALID_INPUT` | 400 | Valibot ไม่ผ่าน |

## GET /accounts
`{ "accounts": [{ "adAccountId": "123", "name": "…", "accountStatus": 1|null }] }` · `PENDING_EXPIRED` / `TOKEN_INVALID` เหมือนข้างบน

## GET /api/meta-audience/connect
| ผล | เมื่อ |
|---|---|
| 302 → `https://www.facebook.com/v21.0/dialog/oauth?scope=ads_management&…` + cookie `fb_audience_oauth_state` | ผู้เรียกอยู่ใน `FB_CHAT_ROLE_USER_IDS` |
| 403 `NOT_ROLE_USER` | คนนอก role (ads_management ยัง Standard) — ใช้ทางกรอก token เอง |
| 500 | ไม่ได้ตั้ง `FB_CHAT_APP_ID` |

## GET /api/meta-audience/callback
302 → `/settings/conversions-api?audience=` ค่า: `choose_account` (สำเร็จ + ตั้ง cookie `fb_audience_pending`) · `cancelled` · `state_mismatch` · `no_code` · `no_ad_account` · `error`

## Meta Graph ที่เรียก (ตัวเลขเวอร์ชันจาก `GRAPH_BASE`)
| เรียก | ใช้ที่ |
|---|---|
| `POST /act_{id}/customaudiences` `{name, subtype:"CUSTOM", description, customer_file_source:"USER_PROVIDED_ONLY", audience_labels:["GENERAL_CUSTOMERS"]}` | cron สร้าง |
| `POST|DELETE /{audienceId}/users` `{payload:{schema,data,page_ids?}}` ≤10,000 | cron เพิ่ม/ถอน |
| `GET /act_{id}?fields=name,account_status` | ตรวจตอน MANUAL |
| `GET /me/adaccounts?fields=id,name,account_status&limit=100` | OAUTH |
| `GET /oauth/access_token` (code → short → `fb_exchange_token`) | callback |

## Push (ผู้ถือ X9 · `{type:'channel-health', url:'/settings/conversions-api'}`)
`pushMetaAudienceStopped` (ครั้งเดียวตอน ACTIVE→STOPPED) · `pushMetaAudienceTokenExpiring` (ครั้งเดียว ที่ < 7 วัน)

## Cron ผลคืน
`{ ok, connections, added, removed, stopped, retried }`
