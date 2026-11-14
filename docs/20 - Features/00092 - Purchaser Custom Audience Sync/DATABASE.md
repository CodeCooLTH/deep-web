---
title: "DATABASE — 00092 Custom Audience ลูกค้าที่ซื้อแล้ว"
owner: shinobu22
status: backend-implemented
created: 2026-11-14
tags: [feature, database, meta, ads, custom-audience]
related: ["[[SRS]]", "[[SDS]]"]
---

# DATABASE 00092

Migration: `prisma/migrations/20261114110000_00092_purchaser_audience/migration.sql` (สร้างจาก `prisma migrate diff` เทียบ schema ก่อนแก้) — **additive ล้วน**: 2 ตาราง ใหม่ + index + FK `ON DELETE CASCADE` ไปที่ `Shop` · ไม่มี backfill · ไม่มี CHECK (ค่า string บังคับที่ service) · ไม่แตะตารางเดิม (ฝั่ง Prisma เพิ่มเฉพาะ relation บน `Shop`)

HR15: push `main` = `migrate deploy` บน prod · prod ไม่ต้องสั่ง · local ต้อง `prisma migrate deploy` เอง · migrate ล้ม = deploy ไม่ขึ้น

## MetaAudienceConnection (1 แถวต่อร้าน)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | text PK | |
| `shopId` | text **UNIQUE** FK | |
| `adAccountId` | text | ตัวเลขล้วน ไม่มี `act_` |
| `adAccountName` | text? | |
| `tokenEnc` | text | 🛑 `token-crypto` · ห้าม select ออก client/log |
| `tokenSource` | text | `OAUTH` \| `MANUAL` |
| `tokenExpiresAt` | timestamptz? | `OAUTH` ~60 วัน · `MANUAL` = null |
| `expiryWarnedAt` | timestamptz? | กันแจ้งซ้ำ |
| `audienceId` / `audienceName` | text? | null = ยังไม่สร้าง (หรือถูกลบใน Meta รอสร้างใหม่) |
| `enabled` | bool default false | |
| `enabledAt` | timestamptz? | ตั้งครั้งแรกที่เปิด |
| `backfilledAt` | timestamptz? | null = ยังไม่เติมย้อนหลัง |
| `status` | text default `ACTIVE` | `ACTIVE` \| `STOPPED` |
| `stoppedReason` / `stoppedAt` | text? / timestamptz? | `TOKEN_OR_PERMISSION` \| `TERMS_NOT_ACCEPTED` |
| `lastSyncedAt` | timestamptz? | cron ตรวจล่าสุดสำเร็จ |
| `lockedAt` | timestamptz? | จองตัวส่ง (stale 5 นาที) |
| `createdAt` / `updatedAt` | timestamptz | |

Index: UNIQUE `(shopId)` · `(enabled, status)`

## MetaAudienceMember (1 แถวต่อตัวตนต่อร้าน)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | text PK | |
| `shopId` | text FK | |
| `identityType` | text | `PSID` \| `PHONE` |
| `identityKey` | text | PSID หรือ SHA-256 hex ของ `66XXXXXXXXX` — **ไม่เก็บเบอร์ดิบ** |
| `pageId` | text? | เฉพาะ `PSID` |
| `desired` | text | `IN` \| `OUT` — ควรเป็น |
| `syncedState` | text default `OUT` | `IN` \| `OUT` — Meta มีอยู่ตามที่เรารู้ |
| `attempts` | int default 0 | |
| `nextAttemptAt` | timestamptz default now() | backoff |
| `lastError` | text? | ≤300 ตัวอักษร |
| `createdAt` / `updatedAt` | timestamptz | |

Index: **UNIQUE `(shopId, identityType, identityKey)`** (กันซ้ำ BR · ซื้อซ้ำ = แถวเดียว) · `(shopId, desired, syncedState, nextAttemptAt)` (ตัวส่งดึงค้าง)

ค้างส่ง = `desired ≠ syncedState`

## PII
`identityKey` ของ `PSID` = ตัวตนในระบบ Meta (ไม่ใช่เบอร์/อีเมล) · ของ `PHONE` = แฮชทางเดียว · ทั้งสองส่งออกนอกระบบเฉพาะไปที่ Meta Custom Audience ของร้านเอง

## Rollback
ก่อนมีข้อมูล: `DROP TABLE "MetaAudienceMember"; DROP TABLE "MetaAudienceConnection";` · หลังมีข้อมูล = destructive ถามผู้ใช้ก่อน · ทางถอยที่ปลอดภัยคือไม่ตั้ง `OPEN_META_AUDIENCE`
