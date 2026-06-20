---
title: "Template — Test Case"
owner: shinobu22
status: draft
created: 2026-05-19
tags: [template, feature, test]
related: ["[[Index]]", "[[Feature-Templates/BRD]]"]
---

> **โมดูล:** {{MODULE_ID — เช่น M2-UpSell}}
> **ประเภทเอกสาร:** Test Case
> **เวอร์ชัน:** {{VERSION — เช่น 1.0}}
> **วันที่จัดทำ:** {{YYYY-MM-DD}}
> **สถานะ:** {{STATUS — เช่น Draft / Reviewed / Approved}}
> **เจ้าของเอกสาร:** QA (ดู [[Feature-Docs-Ownership]])

<!--
TEMPLATE GUIDE — อ่านก่อนใช้
- Test Case เป็นเอกสาร "ชุดเคสทดสอบ" เจ้าของคือ QA เท่านั้น
- input ของ Test Case คือ [[BRD]] ของโมดูลเดียวกัน — ทุก scenario ต้อง trace กลับ
  Acceptance Criteria (AC-XXX) หรือ Functional Requirement (FR-XXX) ใน BRD ได้
- ลำดับ: PRD → BRD → SRS → SDS → (API.md + DATABASE.md) → Tests/ (เอกสารนี้)
- Traceability Matrix (ข้อ 3) ต้องครอบคลุม "ทุก AC" ใน BRD — AC ใดไม่มี TC = ช่องโหว่
- Flow ในข้อ 4 (ถ้ามี) "ต้องใช้ Mermaid เท่านั้น" ห้าม ASCII art, ห้ามรูปภาพ,
  ห้าม external tool (ดู [[Feature-Docs-Ownership]] §4)
- ลบ comment ทั้งหมดและแทน {{PLACEHOLDER}} ทุกตัวก่อนส่ง WRITER gate
-->

# Test Case: {{ชื่อระบบ/ฟีเจอร์}}

---

## 1. Overview

<!-- ระบุว่าชุดทดสอบนี้ครอบคลุมขอบเขตใด และ trace กลับ requirement ชั้นใด -->

{{อธิบายภาพรวมว่าชุดทดสอบนี้ครอบคลุมฟีเจอร์ใด, ประเภททดสอบ (functional / regression / e2e),
สภาพแวดล้อมที่ทดสอบ และส่วนที่อยู่นอกขอบเขต}}

- **เอกสารต้นทาง:** [[BRD]] ของโมดูลนี้ (ทุก scenario ต้อง trace กลับ AC-XXX / FR-XXX)
- **ขอบเขตชุดทดสอบ (Scope):** {{ระบุ in-scope / out-of-scope}}
- **สภาพแวดล้อม:** {{เช่น staging / data set ที่ใช้}}

---

## 2. Test Scenarios

<!-- หนึ่ง block ต่อหนึ่ง scenario; ทำซ้ำ block ตามจำนวนเคส ทุกเคสต้องอ้าง AC/FR ใน BRD -->

### TC-001: {{ชื่อ scenario}}

- **Linked to:** {{AC-001 / FR-001 ใน [[BRD]]}}
- **Precondition:** {{สถานะ/ข้อมูลตั้งต้นก่อนเริ่มทดสอบ}}
- **Steps:**
  1. {{ขั้นตอนที่ 1}}
  2. {{ขั้นตอนที่ 2}}
  3. {{ขั้นตอนที่ 3}}
- **Expected Result:** {{ผลลัพธ์ที่คาดหวัง — ต้องวัด/ตรวจได้ชัดเจน}}

### TC-002: {{ชื่อ scenario — เช่น negative case}}

- **Linked to:** {{AC-002 / FR-002 ใน [[BRD]]}}
- **Precondition:** {{...}}
- **Steps:**
  1. {{...}}
  2. {{...}}
- **Expected Result:** {{...}}

<!-- ทำซ้ำหัวข้อ TC-003, TC-004, ... ครอบคลุมทั้ง happy path และ negative/edge case -->

---

## 3. Traceability Matrix

<!-- map ทุก AC/FR ใน BRD กับ TC — ทุก AC ต้องมีอย่างน้อย 1 TC ครอบคลุม ห้ามมี AC ที่ไม่ถูกทดสอบ -->

| AC / FR ใน [[BRD]] | Test Case | ครอบคลุมหรือไม่ |
|---------------------|-----------|------------------|
| {{AC-001}} | {{TC-001}} | {{Yes}} |
| {{AC-002}} | {{TC-002, TC-003}} | {{Yes}} |
| {{FR-003}} | {{TC-004}} | {{Yes}} |

> ทุก AC ใน [[BRD]] ต้องปรากฏในตารางนี้และมี TC อย่างน้อย 1 รายการ — AC ที่ไม่มี TC ถือว่าช่องโหว่
> WRITER gate จะ reject ถ้าตารางนี้ไม่ครอบคลุมทุก AC

---

## 4. Flow (ถ้ามี)

<!-- ใส่เฉพาะเมื่อ test flow ซับซ้อน/มีหลายสาขา; ถ้าไม่มีให้ระบุว่า "ไม่มี" -->

> **บังคับ:** ถ้ามี flow/diagram ใด ๆ ในหัวข้อนี้ **ต้องใช้ Mermaid เท่านั้น**
> ห้าม ASCII art, ห้ามรูปภาพ, ห้าม external tool (ดู [[Feature-Docs-Ownership]] §4)

```mermaid
flowchart TD
    Start([{{เริ่มทดสอบ}}]) --> S1[{{ขั้นตอน / action}}]
    S1 --> D1{ {{เงื่อนไข — ผ่านหรือไม่}} }
    D1 -- {{ใช่}} --> S2[{{ผลลัพธ์ที่คาด — pass}}]
    D1 -- {{ไม่}} --> S3[{{ผลลัพธ์ — fail / error path}}]
    S2 --> End([{{จบ}}])
    S3 --> End
```

---

## 5. ผลล่าสุด

<!-- บันทึกผลการรันแต่ละรอบ — อัปเดตทุกครั้งที่รันชุดทดสอบ -->

| Run | วันที่ | ผล (Pass/Fail/Blocked) | ผู้ทดสอบ (Tester) |
|-----|--------|--------------------------|---------------------|
| {{1}} | {{YYYY-MM-DD}} | {{Pass / Fail — ระบุ TC ที่ fail}} | {{ชื่อผู้ทดสอบ}} |
| {{2}} | {{YYYY-MM-DD}} | {{...}} | {{...}} |

---

## 6. สรุป (Summary)

เอกสาร Test Case นี้กำหนด **ชุดเคสทดสอบ** ของ **{{ชื่อระบบ}}** ที่ trace กลับ Acceptance Criteria
ใน [[BRD]] ทุกข้อ เพื่อให้มั่นใจว่าทุกข้อกำหนดเชิงธุรกิจถูกทดสอบครบ

**Open Questions:**
- {{ถ้ามี}}
