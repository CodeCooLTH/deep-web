---
title: "Extension — Scam-link Detection ในแชท"
owner: shinobu22
status: draft
module: M00011-DeepChat
version: "1.0"
created: 2026-07-04
tags: [feature, chat, scam-detection, safety, extension]
related: ["[[../PRD]]", "[[./product-context-card.md]]", "[[./response-rate-metric.md]]"]
---

> **โมดูล:** M00011-DeepChat — Phase-2 #3 · safepay-product · ปลด OOS-7 baseline หลัก

# Extension: Scam-link Detection ในแชท

## Goal
ตรวจจับลิงก์เสี่ยงหลอกลวงในข้อความ TEXT ด้วย rule-based heuristic ในระบบเอง (ไม่พึ่ง external API) แล้ว **เตือน** (WARN) ผู้ใช้ 2 ฝั่งด้วย banner ในบับเบิล — ตรงแก่น trust platform ต้านมิจฉาชีพ โดยไม่ over-block

## Locked decisions (Controller, best-judgment ตาม recommended)
| DG | ค่า |
|---|---|
| A behavior | **WARN/annotate** (ส่งได้ปกติ + banner; ไม่ block — false-positive สูง, ไม่ regress FR-CHAT-04) |
| B เก็บ flag | **Persist ที่ ChatMessage** (`flaggedScam Boolean`, `scamMatchedRules Json?`) — perf + audit |
| C admin queue | **ไม่มีใน MVP** (เคารพ OOS-12 privacy) → S-34 deferred |
| D keyword | **ไทย + อังกฤษ** |

## FR (FR-SCAM-01..08)
| FR | รายละเอียด |
|----|-----------|
| FR-SCAM-01 | `detectScamLink(text)` pure fn ใน `src/lib/scam-link-detector.ts` (ไม่ import DB/network) → `{flagged, matchedRules[], score}` |
| FR-SCAM-02 | **URL อย่างเดียวไม่พอ** flag — ต้องมี risk signal เพิ่ม (BR-SCAM-02, กัน false-positive) |
| FR-SCAM-03 | integrate `sendMessage()` เฉพาะ type='TEXT' ก่อน insert → persist flag ใน tx เดียว |
| FR-SCAM-04 | UI warning banner ในบับเบิลข้อความ flaggedScam=true (buyer Vuexy + seller Paces) |
| FR-SCAM-05 | **ไม่ block** ส่ง (WARN) — flow insert/broadcast/notification เดิมไม่เปลี่ยน |
| FR-SCAM-06 | copy เป็นกลาง ("มีลิงก์ที่ควรระวัง — อย่าโอนเงิน/ให้ OTP กับคนไม่รู้จัก" ไม่ใช่ "เป็นการหลอกลวง") กัน false-positive กระทบร้านจริง |
| FR-SCAM-07 | allowlist `deepthailand.app`+subdomain ไม่ flag (ลิงก์ /o/{token} /u/{username} paste ได้) |
| FR-SCAM-08 | Vitest ครอบทุก rule + **false-positive fixture** (YouTube/Facebook/Deep เอง/ขนส่ง thailandpost ต้องไม่ flag) |

## Heuristic Rules (MVP)
มี URL (R-URL gate) **และ** ≥1 strong หรือ ≥2 weak:
- **strong:** R-SHORTENER (bit.ly/tinyurl/is.gd/cutt.ly/t.co/rebrand.ly/s.id...), R-IP-URL (IP แทนโดเมน), R-LOOKALIKE (Levenshtein ≤2 กับ deepthailand.app/ธนาคาร), R-CRED-IN-URL (`user:pass@host`)
- **weak:** R-FREE-TLD (.tk/.ml/.ga/.cf/.gq), R-KEYWORD (ไทย: โอนเงิน/ธนาคาร/รหัส OTP/ลิงก์ด่วน/ยืนยันบัญชี/ด่วนที่สุด/คลิกลิงก์; อังกฤษ: verify your account/urgent/click here)

## BR
BR-SCAM-01 ไม่พึ่ง external API · BR-SCAM-02 URL+signal · BR-SCAM-03 ไม่ block · BR-SCAM-04 scan เฉพาะ TEXT (ไม่ IMAGE/PRODUCT) · BR-SCAM-05 flag=snapshot ณ ส่ง (ไม่ re-scan ย้อนหลัง) · BR-SCAM-06 allowlist ตัวเอง

## Schema Delta (additive, ChatMessage)
```
flaggedScam       Boolean  @default(false)
scamMatchedRules  Json?    // rule IDs audit
```
migration ADD COLUMN (collision-check ts หลัง 20260704000100)

## Scope (S-28..S-33; S-34 deferred)
| S-id | รายการ |
|------|--------|
| S-28 | `src/lib/scam-link-detector.ts` pure fn (rules + allowlist) |
| S-29 | schema flaggedScam/scamMatchedRules + migration additive |
| S-30 | `sendMessage()` extend — detect type=TEXT ก่อน insert, persist tx เดียว (ไม่แก้ signature/denorm) + GET messages enrich flaggedScam ใน ChatMessageView |
| S-31 [UI] | buyer Vuexy warning banner ในบับเบิล — safepay-ux |
| S-32 [UI] | seller Paces warning banner — safepay-ux (HR7/12) |
| S-33 | Vitest rule + false-positive fixture |

## Out-of-Scope
OOS-23 ML/external API · OOS-24 image/QR scam · OOS-25 ผูก ScamReport model · OOS-26 auto-block/suspend · OOS-27 IDN homograph · OOS-28 block ส่ง · OOS-29 admin moderation queue (S-34 deferred) · OOS-30 retroactive re-scan · OOS-31 obfuscated URL (เว้นวรรค)

## Baseline sync
OOS-7 → CLOSED by this ext (S-28..S-33); ลบจาก Deferred list
