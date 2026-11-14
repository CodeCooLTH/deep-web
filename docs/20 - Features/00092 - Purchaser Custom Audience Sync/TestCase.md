---
title: "TestCase — 00092 Custom Audience ลูกค้าที่ซื้อแล้ว"
owner: shinobu22
status: backend-implemented
created: 2026-11-14
tags: [feature, testcase, meta, ads, custom-audience]
related: ["[[SRS]]", "[[SDS]]"]
---

# TestCase 00092

เทสทั้งหมดฉีด `fetchImpl` ปลอม — ไม่แตะเครือข่าย · เทส DB รันเฉพาะ `localhost:5434` และลบเฉพาะ id ที่เทสสร้าง (HR13/14)

## Unit — `src/lib/meta-audience/__tests__/meta-audience.test.ts` (29)
| กลุ่ม | ครอบคลุม |
|---|---|
| gate | ไม่ตั้ง = ปิด · เปิดไม่มีรายชื่อ = ทุกร้าน · มีรายชื่อ = เฉพาะที่อยู่ · ค่า `true` ไม่เปิด |
| phoneHash | `0812345678` → `9b82e4d0…05ed` (คำนวณมือ `printf 66812345678 \| shasum -a 256`) · ตัดขีด/เว้นวรรค · ไม่ใช่เบอร์ไทย = null |
| buildUsersPayload | PSID = `UID`+`page_ids` · PHONE ไม่มี `page_ids` |
| isCountedOrder | ตาราง `CREATE/CONFIRM/PAYMENT` × ร่าง/ทดสอบ/ยกเลิก/คืน/ยืนยัน/ชำระครบ (11 เคส) |
| classifyAudienceResult | 2xx OK · 190 STOP · terms (subcode+ข้อความ) TERMS · subcode 33 GONE · 17/503/0 RETRY · param ผิด FAIL |
| urls | termsUrl · adsManagerUrl · audienceName |

## DB — `src/services/__tests__/meta-audience.db.test.ts` (27)
| FR/BR | เคส |
|---|---|
| FR-004 | ชำระครบในห้อง Messenger + เบอร์ → PSID+เพจ และเบอร์แฮชทั้งคู่ · ยังไม่ชำระ+CREATED ไม่เข้า (ค่าเริ่มต้น PAYMENT) · ร้านตั้ง CREATE เข้าตอนสร้าง |
| FR-004 | ร่าง/ทดสอบ/ไม่มี connection/ฟีเจอร์ปิด = ไม่เขียน · ซื้อซ้ำ = แถวเดียว · SHIPPED ไม่เปลี่ยนอะไร |
| FR-005 / BR-CA-03 | ยกเลิกใบเดียว → ถอน · ยังมีใบอื่นเบอร์คนละรูปแบบ → ไม่ถอน แล้วค่อยถอนเมื่อใบสุดท้ายคืนของ · ใบร้านอื่นไม่ค้ำ · ถอนแล้วซื้อใหม่ → IN |
| FR-007 | backfill เก็บเฉพาะใบที่นับ + ตั้ง `backfilledAt` · cron รอบแรกเติมแล้วส่งรอบเดียว |
| FR-003/006 | สร้าง audience (body ตรงสเปก) แล้วส่ง UID+page_ids กับ PHONE แยกคำขอ · token ใน header เท่านั้น ไม่มีเบอร์ดิบ/token ใน body · DELETE สำหรับถอน + รอบถัดไปไม่ซ้ำ · 10,050 แถว → 10,000+50 · audience หาย → สร้างใหม่+เติมทุกคน |
| FR-006 | 190 → STOPPED + push ครั้งเดียว + ร้านอื่นไม่โดน + หยุดแล้วไม่ยิงอีก · terms → `TERMS_NOT_ACCEPTED` + `termsUrl` · 503 → backoff ไม่หยุดร้าน · enabled=false/ออกจากรายชื่อทดลอง = ไม่ส่ง · token < 7 วัน แจ้งครั้งเดียว · lock สด = ข้าม |
| FR-002/008 | ฟีเจอร์ปิด 404 · MANUAL เก็บแบบเข้ารหัส สถานะไม่มี token · token ไม่ผ่านไม่เก็บ · เปลี่ยนบัญชี → ล้าง audience + ยังไม่ส่ง · ปิดใช้ไม่ลบ · ตัดการเชื่อมล้างแถว · STOPPED เปิดไม่ได้ |

## เทสที่มีอยู่แล้วและต้องเขียว
`route-capability-inventory` (ทะเบียน route ใหม่ 5 ไฟล์) · `tests/integration/role-contract.test.ts` (2 คำอธิบาย COVERED ใหม่) · `meta-capi-*.db.test.ts` (hook ใหม่ไม่กระทบ) · `channels/facebook/**` (เพิ่ม scope ใน PENDING_REVIEW_SCOPES)

## ที่ยังไม่ได้ทดสอบ (ต้องทำกับ Meta จริง / UI)
- ยิง Marketing API จริง: ชื่อ schema `UID`, รหัส error ข้อตกลง, audience หาย — ทดสอบกับร้านธนภัทร์
- OAuth ครบวงจร (ต้องมี redirect URI ใน App Dashboard + สิทธิ์ `ads_management`)
- route handler โดยตรง (ด่าน X9 ครอบด้วย route-capability-inventory + service tests) · UI การ์ดตั้งค่า (งานถัดไป)
- `native-chat-sync` แดงจาก `route-capabilities.ts` (ดู §ผล) — ต้องให้ Controller ตัดสินว่าไม่กระทบแชท Native แล้ว pin
