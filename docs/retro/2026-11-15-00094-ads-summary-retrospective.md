---
title: "Retro — 00094 หน้าสรุปโฆษณา /reports/ads-summary"
created: 2026-11-15
tags: [retro, ads, meta, report]
related: ["[[00094 - Ads Intelligence Report/PRD]]", "[[00094 - Ads Intelligence Report/BRD]]"]
---

# Retro 00094 — หน้าสรุปโฆษณา

## สิ่งที่ส่ง
PRD/BRD → ม็อกอัพ (user แก้ราว 20 รอบ) → contract `src/lib/ad-summary/types.ts` → agent 3 ตัวขนาน (lib · Meta/service · UI) → reviewer + security → แก้ตามที่ตีกลับ → rebase ทับงาน 00091 เฟส 3 (#243) → PR #245 · ไม่มี migration

## ที่ได้ผล
- **ล็อก contract ก่อนเปิด agent ขนาน** — สามชั้นเขียนพร้อมกันได้ ตอนรวมงานแก้ type แค่ 2 จุด
- **ม็อกอัพที่คำนวณกฎจริงในสคริปต์** (ป้ายจัดกลุ่ม · คำแนะนำ) ทำให้ user ติเนื้อหาได้ตั้งแต่ก่อนเขียนโค้ด และ agent UI แปลงตามได้ตรง
- **reviewer อิสระจับบั๊กที่ "จะเกิดหลัง deploy" ได้** — คีย์ `unstable_cache` เดิมกับ shape ใหม่ = NaN 15 นาทีแรกบน prod (เทสในเครื่องไม่มีทางเห็น เพราะแคชว่าง)

## ที่พลาด / บทเรียน
1. **เปลี่ยน shape ของสิ่งที่อยู่ใน `unstable_cache` ต้องเปลี่ยนคีย์เสมอ** — Data Cache อยู่ข้าม deploy · session อื่น (#243) ก็ขยาย `InsightsRow` โดยไม่เปลี่ยนคีย์เหมือนกัน (`ad-spend-v2` ของเราครอบให้แล้ว)
2. **ตัวเลือกของ bundle ร่วมต้อง opt-in** — เพิ่มคำขอ `daily` ใน `getQualityBundle` แบบตั้งต้น "ยิงทั้งหมด" ทำให้หน้า 00093 ยิง Meta เพิ่มเงียบ ๆ (เทสนับคำขอจับได้)
3. **agent ทั้ง 3 ตัวรัน `tsc` ทั้งโปรเจกต์ทั้งที่ห้าม** และตัวหนึ่ง `pkill -f "tsc --noEmit"` (global) — บรีฟต้องบอกเหตุผลด้วย (กินแรม 8GB · ฆ่างานคนอื่น) ไม่ใช่แค่ห้าม
4. **นิยามระดับกลุ่มหลุดจาก KPI** — ROAS แคมเปญใช้ยอดทุกโฆษณา ขณะที่ KPI ใช้ชุด covered · แก้ด้วย helper กลาง `roasOfRow/cpaOfRow` ตัวเดียว (HR16 ใช้กับ "ทุกระดับ" ไม่ใช่แค่ตัวเลขหลัก)
5. **เทส `native-chat-sync` แดงจาก `route-capabilities.ts`** — ไฟล์ทะเบียนนี้ถูกแอป Native คัดลอกไป ทุก route ใหม่ต้องปักหมุด + บรรทัด `Native:` ใน PR
6. **สอง session ทำรายงานโฆษณาพร้อมกันบนไฟล์เดียวกัน** (insights · เมนู · i18n · route-capabilities) — rebase สะอาดได้ด้วยการ union แต่ไอคอนเมนูชนกัน (`report-analytics` ทั้งคู่) ต้องตาคนดูเท่านั้น

## carry
- ยังไม่เปิดหน้าจริง · `/impeccable critique` บนหน้าจริง · parser Meta entities/daily ยังไม่เทียบ payload จริง
- คำ "แชท (Deep)"/"แอด" ในหน้า 00091/00093 ตามกฎคำใหม่ (BR-AIR-14/15)
- `classify` ฝังข้อความไทยใน lib (EN เห็นไทยที่ tooltip ป้าย)
