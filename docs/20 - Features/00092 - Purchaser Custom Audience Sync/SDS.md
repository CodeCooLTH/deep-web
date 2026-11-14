---
title: "SDS — 00092 Custom Audience ลูกค้าที่ซื้อแล้ว"
owner: shinobu22
status: backend-implemented
created: 2026-11-14
tags: [feature, sds, meta, ads, custom-audience]
related: ["[[SRS]]", "[[API]]", "[[DATABASE]]", "[[TestCase]]"]
---

# SDS: โครงสร้างระบบ

## 1. ภาพรวม

```mermaid
flowchart LR
    A[บริการออเดอร์ 13 ไฟล์] -->|enqueueOrderCapiAfterCommit| B[CAPI enqueue]
    B --> C[markOrderPurchaserAfterCommit]
    C -->|desired IN/OUT| D[(MetaAudienceMember)]
    E[cron /api/cron/meta-audience ทุก 5 นาที] --> F[sweepMetaAudience]
    F -->|จองร้านด้วย lockedAt| G[syncConnection]
    G --> H[backfillShopAudience]
    G --> I[สร้าง audience]
    G --> J[POST/DELETE /AUDIENCE_ID/users]
    D --> J
    J -->|OK| D
    J -->|STOP/TERMS| K[(Connection STOPPED) + push owner]
```

## 2. ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/meta-audience/gate.ts` | สวิตช์ระบบ |
| `…/identity.ts` | `phoneHash` (66+เลข → SHA-256) · `buildUsersPayload` · `UID_SCHEMA`/`PHONE_SCHEMA`/`MAX_BATCH` |
| `…/counted.ts` | `isCountedOrder(order, purchaseAt)` — ฟังก์ชันบริสุทธิ์ |
| `…/classify.ts` | `classifyAudienceResult` (OK/RETRY/STOP/FAIL/TERMS/GONE · ต่อยอด `classifySendResult` ของ 00089) · URL ข้อตกลง/Ads Manager · ชื่อ audience |
| `…/oauth.ts` | แลก code → long-lived + `expiresAt` · `listAdAccounts` · cookie เข้ารหัสพัก token (`sealPending`/`openPending`) · `audienceScopeFor` (เฉพาะ role) |
| `…/route-helpers.ts` | `audienceRun` แปลง `AudienceError` → HTTP |
| `src/services/meta-audience.service.ts` | hook · recompute · backfill · cron sweep |
| `src/services/meta-audience-settings.service.ts` | สถานะ · connect (MANUAL/OAUTH) · เปิด-ปิด · ตัดการเชื่อม |
| `src/services/meta-capi.service.ts` | **แก้เล็ก:** `enqueueOrderCapiAfterCommit` เรียก `markOrderPurchaserAfterCommit` ท้ายฟังก์ชัน |
| `src/services/seller-push.service.ts` | `pushMetaAudienceStopped` · `pushMetaAudienceTokenExpiring` (ผู้ถือ `X9`) |

## 3. การออกแบบหลัก

### 3.1 hook = ทำเครื่องหมาย ไม่ส่ง
`markOrderPurchaserAfterCommit` (ไม่ throw) ทำงานทุกครั้งที่ CAPI enqueue ถูกเรียก — ทุกจุดที่ 00089 ผูกไว้จึงครอบคลุมโดยโครงสร้าง (HR16 ไม่ต้องไล่แก้ 13 ไฟล์) ขั้นตอน: โหลดใบ → ข้ามร่าง/ทดสอบ → ข้ามถ้าฟีเจอร์ปิด/ไม่มี connection → ทริกเกอร์ที่ไม่ใช่ CANCELED/RETURNED ต้องให้ `eventsForTrigger` มี `PURCHASE` → `recomputeIdentity` ต่อตัวตน

### 3.2 desired vs syncedState
แถวสมาชิกเก็บ "ควรเป็น" (`desired`) กับ "Meta มีอยู่แล้ว" (`syncedState`) · ไม่เท่ากัน = ค้างส่ง (เพิ่มหรือถอน) · เหตุการณ์ซ้ำ/ลำดับสลับ (ซื้อ→ยกเลิก→ซื้อ) ไม่เสียหายเพราะ `recomputeIdentity` ตัดสินจากสถานะใบทั้งหมดทุกครั้ง ไม่ใช่จากลำดับเหตุการณ์ · อัปเดต `syncedState` ด้วยเงื่อนไข `desired` เดิม กันแข่งกับ hook ระหว่างส่ง

### 3.3 ตัวส่ง
- จองร้านด้วย `updateMany({id, lockedAt: ค่าที่อ่านมา})` (stale 5 นาที) · `finally` ปลดล็อก
- ต่อร้าน ≤5 รอบ/cron · แต่ละรอบ ADD แล้ว REMOVE · แยกกลุ่ม PSID ตามเพจ (`page_ids`) และเบอร์ · ≤10,000/คำขอ
- ผลลัพธ์: `OK` → `syncedState` · `RETRY/FAIL` → `attempts+1` + backoff `5 นาที × 2^(n-1)` เพดาน 24 ชม. ไม่หยุดร้าน · `STOP/TERMS` → `status=STOPPED` ด้วย `updateMany where ACTIVE` (push ครั้งเดียว) แถวไม่นับครั้ง · `GONE` → ล้าง `audienceId` สร้างใหม่ครั้งเดียวต่อรอบ + `resetSynced`
- เรียก Meta ด้วย `Authorization: Bearer` (ไม่มี token ใน body/URL) · `fetchImpl` ฉีดได้ทุกจุด (เทสไม่แตะเครือข่าย)

### 3.4 OAuth
`/api/meta-audience/connect` (X9 + เฉพาะ role) → Facebook → `/api/meta-audience/callback` แลก long-lived token → ตรวจว่ามีบัญชีโฆษณา → เก็บ token+expiry ใน cookie `fb_audience_pending` (AES-GCM ด้วย `token-crypto` · httpOnly · path `/api/shops/meta-audience` · 10 นาที) → redirect `/settings/conversions-api?audience=choose_account` → UI เรียก `GET …/accounts` แล้ว `POST …/connect {mode:'OAUTH', adAccountId}` (ตรวจว่าอยู่ในรายการที่ token เข้าถึงได้) → ลบ cookie

### 3.5 ความปลอดภัย
- `tokenEnc` ไม่ถูก select ออกจาก service (`getAudienceStatus` เลือกฟิลด์เอง) · ไม่ log token/body
- ทุกเส้นทาง `X9` + `force-dynamic` + `Cache-Control: private, no-store`
- ฟีเจอร์ปิด = 404 ก่อนอื่นใด (ร้านต้องไม่รู้ว่ามีฟีเจอร์)

## 4. ความเสี่ยงที่ยังเปิด
| ความเสี่ยง | ทางลด |
|---|---|
| ชื่อ schema `UID` ของ PSID ยังไม่ผ่านการยิงจริง | ค่าคงที่เดียว `UID_SCHEMA` · ทดสอบกับร้านธนภัทร์ก่อน |
| รหัส error จริงของ "ข้อตกลง"/"audience หาย" | ตรวจทั้ง subcode และข้อความ · สังเกตครั้งแรกที่เกิด |
| `lastSyncedAt` อัปเดตแม้ไม่มีอะไรส่ง | หมายถึง "cron ตรวจล่าสุด" ไม่ใช่ "ส่งล่าสุด" |
