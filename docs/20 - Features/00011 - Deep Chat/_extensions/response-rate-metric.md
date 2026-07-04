---
title: "Extension — Response-rate / Response-time Trust Metric"
owner: shinobu22
status: draft
module: M00011-DeepChat
version: "1.0"
created: 2026-07-04
tags: [feature, chat, trust-metric, profile, extension]
related: ["[[../PRD]]", "[[./product-context-card.md]]"]
---

> **โมดูล:** M00011-DeepChat — Phase-2 #2 · safepay-product
> ปลด OOS-8 baseline หลัก (response-rate trust metric); แตะเฉพาะส่วน "Response" ของ FR-9.10 (on-time/cross-platform ยัง placeholder)

# Extension: Response-rate / Response-time Trust Metric

## Goal
คำนวณ "อัตราการตอบ / เวลาตอบเฉลี่ย" ของร้านจาก Deep Chat data ที่มีอยู่ (Conversation/ChatMessage) แล้วแสดงจริงแทน placeholder "replies in ~8 min" บน `/u/[username]` — ไม่แก้สูตร Trust Score, ไม่ทำให้ public profile ช้า

## Locked decisions (Controller)
| # | ค่า |
|---|---|
| คำนวณที่ไหน | **Cron รายวัน (option C)** — recompute จาก source, denormalize ลง Shop fields (read เร็ว, ไม่ query สดหน้า public, ไม่ incremental-bug) |
| Schema | **เพิ่ม 4 field nullable บน Shop** (additive) |
| Trust Score | **ไม่ผูกสูตร 5-factor** (BR-RESP-03) — แสดงเป็น profile stat อิสระเหมือน on-time/cross-platform |
| Badge "ตอบเร็ว" (S-27) | **defer** (เก็บ lean; core = S-22..S-26) |

## FR (FR-RESP-01..07; S-27/FR-08 badge = deferred)
| FR | รายละเอียด |
|----|-----------|
| FR-RESP-01 | นับ conversation ของร้าน (shopId) ที่มีข้อความ buyer อย่างน้อย 1 ใน **rolling 90 วัน** |
| FR-RESP-02 | **Response Rate** = (conv ที่ seller ตอบหลัง buyer ข้อความแรก) ÷ (conv ทั้งหมดที่เข้าเงื่อนไข) × 100 |
| FR-RESP-03 | **Response Time** = median(seller reply แรก − buyer ข้อความแรก) เฉพาะ conv ที่ตอบแล้ว |
| FR-RESP-04 | **Sample-size gate ≥3** (เหมือน showRating); ต่ำกว่า → ซ่อน section response ทั้งหมด (ไม่โชว์เลขปลอม) |
| FR-RESP-05 | ร้านไม่มี conversation → sample=0 → ซ่อน ไม่ error |
| FR-RESP-06 | format: <60นาที→"~N นาที", 1-24ชม.→"~N ชม.", 24-48ชม.→"~1 วัน", >48ชม.→"2+ วัน" |
| FR-RESP-07 | คำนวณผ่าน batch cron รายวัน → denormalize ลง Shop (ไม่ query สดตอน render) |

## BR
BR-RESP-01 metric ผูก Shop (ไม่ใช่ User; business = ต่อร้าน เหมือน recalculateShopTrustScore) · BR-RESP-02 buyer-initiate เสมอ → ข้อความแรก=buyer โดย design · BR-RESP-03 ห้ามผูกสูตร Trust Score 5-factor · BR-RESP-04 window 90 วัน (param cron)

## Schema Delta (additive, Shop)
```
chatResponseRate       Float?    // 0-100, null=ยังไม่พอ
chatResponseSampleSize Int?      // denominator รอบล่าสุด
chatMedianResponseSec  Int?      // median วินาที (conv ที่ตอบแล้ว)
chatMetricsUpdatedAt   DateTime? // cron เขียนล่าสุด
```
index เดิมพอ (`ChatMessage(conversationId,createdAt)`, `Conversation(shopId,lastMessageAt)`). migration ใหม่ ADD COLUMN (collision-check ts หลัง 20260704000000).

## Scope (S-22..S-26)
| S-id | รายการ | Acceptance |
|------|--------|-----------|
| S-22 | schema 4 field Shop + migration additive | migrate ไม่กระทบ table เดิม |
| S-23 | service `computeShopChatMetrics(shopId, windowDays=90)` — SQL aggregate (first buyer msg + first seller reply/conv ใน window) → {sampleSize, answeredCount, responseRate, medianResponseSec} | ตรง fixture คำนวณมือ |
| S-24 | cron `/api/cron/chat-response-metrics` (CRON_SECRET guard, reuse inventory-renewal pattern) — loop Shop isShop+active → S-23 → upsert; +vercel.json crons (เวลาไม่ชน 19:00/20:00 UTC) | field ทุกร้าน active อัปเดต |
| S-25 [UI] | wire field → ProfileLeftContent (`profile/index.tsx` ~251-271) แทน "replies in ~8 min" + format FR-RESP-06 + sample-gate ซ่อนถ้า null/<3; **ไม่แตะ "98% on-time"** (คนละ metric) — safepay-ux ก่อน |
| S-26 | Vitest FR-RESP-01..07 (no-conv, ไม่ตอบ, sample<3 gate, median tie, นอก window, cron idempotent) |

## Out-of-Scope
OOS-17 on-time delivery (ต้อง delivery tracking) · OOS-18 cross-platform stats จริง · OOS-19 ผูก Trust Score formula (ต้อง PRD change req) · OOS-20 per-message SLA · OOS-21 real-time calc (เลือก cron) · OOS-22 seller dashboard metric · **S-27 badge "ตอบเร็ว" = deferred**

## Baseline sync
`docs/scope/2026-07-03-00011-deep-chat-scope-baseline.md`: OOS-8 → CLOSED by this ext (S-22..S-26); ลบ "Response-rate trust metric" จาก Deferred list
