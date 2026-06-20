---
title: "Template — DATABASE"
owner: shinobu22
status: draft
created: 2026-05-19
tags: [template, feature, database]
related: ["[[Index]]", "[[Feature-Templates/SDS]]"]
---

> **โมดูล:** {{MODULE_ID — เช่น M2-UpSell}}
> **ประเภทเอกสาร:** DATABASE Design
> **เวอร์ชัน:** {{VERSION — เช่น 1.0}}
> **วันที่จัดทำ:** {{YYYY-MM-DD}}
> **สถานะ:** {{STATUS — เช่น Draft / Reviewed / Approved}}
> **เจ้าของเอกสาร:** SA (ดู [[Feature-Docs-Ownership]])

<!--
TEMPLATE GUIDE — อ่านก่อนใช้
- DATABASE.md เป็นเอกสาร "ออกแบบโครงสร้างข้อมูล" เจ้าของคือ SA เท่านั้น
  หมายเหตุ: โปรเจกต์นี้ "ไม่มี" agent database_engineer — SA เป็นผู้ออกแบบ schema/ERD/migration plan
  ส่วนการเขียน migration จริง (Laravel migration / Go migration / ฯลฯ) เป็นงานของ DEV ตาม submodule
- input ของ DATABASE.md คือ [[SDS]] ของโมดูลเดียวกัน — ทุกตารางต้อง trace กลับ component/decision ใน SDS ได้
- ลำดับ: PRD → BRD → SRS → SDS → (API.md + DATABASE.md แตกจาก SDS) → Tests/
- ระบบ polyglot หลาย store: อย่าสมมติว่าใช้ DB เดียว — ระบุ store จริงของแต่ละตาราง
  (เช่น MySQL central / MySQL R/W split (wms) / MongoDB (omni) / Redis (goqueue))
- ERD ในข้อ 2 "ต้องใช้ Mermaid erDiagram เท่านั้น" ห้าม ASCII art, ห้ามรูปภาพ,
  ห้าม external tool (ดู [[Feature-Docs-Ownership]] §4) — WRITER gate จะ reject ถ้าไม่มี erDiagram
- ลบ comment ทั้งหมดและแทน {{PLACEHOLDER}} ทุกตัวก่อนส่ง WRITER gate
-->

# DATABASE: {{ชื่อระบบ/ฟีเจอร์}}

---

## 1. Overview

<!-- ระบุว่าโครงสร้างข้อมูลนี้รองรับการออกแบบส่วนใดใน SDS และอยู่บน store ใด -->

{{อธิบายภาพรวมว่าโมดูลนี้ใช้ข้อมูลอะไร, store ใดบ้าง (เช่น MySQL central ของ apps/main/api,
MongoDB ของ apps/omni/api), และโครงสร้างนี้รองรับ component ใดใน SDS}}

- **เอกสารออกแบบต้นทาง:** [[SDS]] ของโมดูลนี้ (ทุกตาราง/collection ต้อง trace กลับ component ใน SDS)
- **Store ที่เกี่ยวข้อง:** {{เช่น MySQL central (apps/main/api) + MongoDB (apps/omni/api)}}
- **Engine / Charset (ถ้ามี):** {{เช่น InnoDB / utf8mb4}}

---

## 2. ERD

<!-- ERD บังคับเด็ดขาด — ต้องใช้ Mermaid erDiagram เท่านั้น ห้าม ASCII/รูปภาพ/external tool -->

```mermaid
erDiagram
    {{TABLE_A}} ||--o{ {{TABLE_B}} : "{{ความสัมพันธ์ เช่น has many}}"
    {{TABLE_A}} ||--|| {{TABLE_C}} : "{{ความสัมพันธ์ เช่น one-to-one}}"

    {{TABLE_A}} {
        {{type}} {{id}} PK "{{คำอธิบาย}}"
        {{type}} {{column_1}} "{{คำอธิบาย}}"
        {{type}} {{column_2}} "{{คำอธิบาย}}"
    }
    {{TABLE_B}} {
        {{type}} {{id}} PK "{{คำอธิบาย}}"
        {{type}} {{table_a_id}} FK "{{อ้างถึง TABLE_A}}"
        {{type}} {{column_1}} "{{คำอธิบาย}}"
    }
    {{TABLE_C}} {
        {{type}} {{id}} PK "{{คำอธิบาย}}"
        {{type}} {{table_a_id}} FK "{{อ้างถึง TABLE_A}}"
    }
```

---

## 3. Tables

<!-- หนึ่ง block ต่อหนึ่งตาราง/collection; ทำซ้ำ block 3.x ตามจำนวนตาราง ระบุ store ของแต่ละตาราง -->

### 3.1 `{{table_name}}` ({{store — เช่น MySQL central}})

{{คำอธิบายสั้นว่าตารางนี้เก็บอะไร และรองรับ component/decision ใดใน SDS}}

| Column | Type | Null | Default | Key |
|--------|------|------|---------|-----|
| `{{id}}` | `{{bigint unsigned}}` | `{{NO}}` | `{{auto_increment}}` | `{{PK}}` |
| `{{tenant_id}}` | `{{bigint unsigned}}` | `{{NO}}` | `{{-}}` | `{{FK / IDX}}` |
| `{{column_1}}` | `{{varchar(255)}}` | `{{NO}}` | `{{-}}` | `{{-}}` |
| `{{column_2}}` | `{{json}}` | `{{YES}}` | `{{NULL}}` | `{{-}}` |
| `{{created_at}}` | `{{timestamp}}` | `{{NO}}` | `{{CURRENT_TIMESTAMP}}` | `{{-}}` |

<!-- ทำซ้ำหัวข้อ 3.2, 3.3, ... สำหรับตารางอื่น โดยคงโครงเดิม -->

---

## 4. Indexes

<!-- ระบุทุก index ที่ตั้งใจสร้าง พร้อมเหตุผล (query pattern ที่รองรับ) -->

| Table | Columns | Type | Rationale (query pattern ที่รองรับ) |
|-------|---------|------|--------------------------------------|
| `{{table_name}}` | `{{(tenant_id, status)}}` | `{{BTREE / composite}}` | {{รองรับ filter รายการตาม tenant + status}} |
| `{{table_name}}` | `{{(reference_id)}}` | `{{UNIQUE}}` | {{กันข้อมูลซ้ำ / รองรับ idempotency}} |
| `{{table_name}}` | `{{(created_at)}}` | `{{BTREE}}` | {{รองรับ query ช่วงเวลา / retention job}} |

---

## 5. Migration Plan

<!-- ลำดับการ migrate, rollback, และผลกระทบ — DEV นำไป implement migration จริงตาม submodule -->

### 5.1 ลำดับการ Migrate

| ลำดับ | การเปลี่ยนแปลง | Submodule / Store | หมายเหตุ (dependency) |
|-------|----------------|--------------------|------------------------|
| 1 | {{สร้างตาราง {{table_a}}}} | {{apps/main/api → MySQL central}} | {{ไม่มี dependency}} |
| 2 | {{สร้างตาราง {{table_b}} (FK → table_a)}} | {{apps/main/api → MySQL central}} | {{ต้องมีลำดับ 1 ก่อน}} |
| 3 | {{เพิ่ม index / backfill ข้อมูล}} | {{...}} | {{ทำนอกชั่วโมง peak ถ้าข้อมูลเยอะ}} |

### 5.2 Rollback

{{ระบุวิธี rollback ของแต่ละลำดับ (drop table / drop column / restore) และข้อจำกัด
เช่น backfill ที่ rollback ไม่ได้ ต้องมีแผนชดเชย}}

### 5.3 ผลกระทบ (Impact)

{{ผลต่อ downtime, lock ตารางใหญ่, ข้อมูลเดิม, backward compatibility ของ service ที่อ่านตารางนี้
และ consistency ข้าม store ถ้า migrate หลาย store}}

---

## 6. Retention / ข้อควรระวัง

<!-- data retention, PII, performance — ห้ามสมมติ ต้องระบุชัด -->

- **Data Retention:** {{ข้อมูลเก็บนานเท่าไร, มี job ลบ/archive หรือไม่, ตารางใดโตเร็ว}}
- **PII / ข้อมูลอ่อนไหว:** {{ระบุ column ที่เป็น PII, การ mask/encrypt, ข้อกำหนด compliance}}
- **Performance:** {{ความเสี่ยง hot row / lock contention / ตารางใหญ่, แนวทาง partition/archive}}
- **Consistency ข้าม store:** {{ถ้าข้อมูลซ้ำ/อ้างข้าม store (เช่น MySQL ↔ MongoDB) ระบุ source of truth
  และวิธี sync — ห้ามสมมติว่า consistent เอง}}

---

## 7. Traceability

<!-- map ทุกตาราง/collection กลับไปยัง component ใน SDS ของโมดูลเดียวกัน -->

| Table / Collection | SDS Component / Decision | สถานะ |
|--------------------|--------------------------|-------|
| `{{table_a}}` | {{component A / TD-001 ใน SDS}} | {{Draft/Done}} |
| `{{table_b}}` | {{component B / Flow 4.1 ใน SDS}} | {{Draft/Done}} |

---

## 8. สรุป (Summary)

เอกสาร DATABASE นี้กำหนด **โครงสร้างข้อมูล** ของ **{{ชื่อระบบ}}** ให้ DEV นำไปเขียน migration จริง
ตาม convention ของแต่ละ submodule, QA ใช้เข้าใจ data model เพื่อวางแผนทดสอบ และทุกตาราง
trace กลับ [[SDS]] ได้

**Open Questions:**
- {{ถ้ามี}}
