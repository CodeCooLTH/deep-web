---
title: "SDS — Image Variants"
owner: shinobu22
status: draft
created: 2026-08-23
tags: [sds, feature, images]
related: ["[[SRS]]"]
---

> **โมดูล:** M54-ImageVariants · **เวอร์ชัน:** 1.0 · **วันที่:** 2026-08-23

# SDS: รูปย่อสำหรับหน้าจอ

---

## 1. บทนำ & References
ออกแบบตาม [[SRS]] — บอกว่าโค้ดอยู่ตรงไหน ใครรับผิดชอบอะไร และทางที่ถูกปฏิเสธถูกปฏิเสธเพราะอะไร

---

## 2. Architecture Overview

```mermaid
flowchart TD
    subgraph lib[src/lib]
      IV[image-variants.ts<br/>IMAGE_VARIANTS · variantKey · buildImageVariant]
      FU[file-url.ts<br/>+ variantUrlOf]
      ST[storage/*<br/>+ saveFileAtKey]
    end
    subgraph api[src/app/api]
      CM[uploads/commit/route.ts<br/>hook เดียว]
      FI[files/[...fileId]/route.ts<br/>ไม่แก้]
    end
    subgraph ui[หน้าจอ]
      PC[ProductCard → thumb]
      PL[ProductLightbox → lg]
      RL[PublicRoomList → thumb]
    end
    SC[scripts/backfill-image-variants.ts]

    CM --> IV --> ST
    SC --> IV
    SC --> ST
    PC --> FU
    PL --> FU
    RL --> FU
```

---

## 3. Component Design

| ชิ้น | ไฟล์ | หน้าที่ |
|------|------|---------|
| `IMAGE_VARIANTS` | `src/lib/image-variants.ts` | ตารางสเปกขนาด/คุณภาพ — SSOT เดียว |
| `variantKey(key, v)` | เดียวกัน | สูตรคีย์ (pure) ใช้ร่วมทั้ง server และ client |
| `buildImageVariant(buf, v)` | เดียวกัน | sharp → Buffer หรือ `null` (ห้าม throw) |
| `canHaveVariants(ext)` | เดียวกัน | allow-list นามสกุล |
| `variantUrlOf(value, v)` | `src/lib/file-url.ts` | คืน URL ของ variant หรือ `null` ถ้าค่านั้นไม่ใช่คีย์ของบัคเก็ตเรา |
| `saveFileAtKey` | `src/lib/storage/{s3,local}.ts` | เขียนไฟล์ที่คีย์ที่กำหนด |
| `generateImageVariants` | `src/services/image-variant.service.ts` | อ่านต้นฉบับ → สร้าง → เขียน (ใช้ร่วม commit + backfill) |

---

## 4. Data Flow

### 4.1 อัปโหลดใหม่
ดู [[SRS]] §4.3 — จุดสำคัญคือ hook อยู่ **ท้ายสุด** ของ commit หลังทุกด่านผ่าน และห่อ try/catch ที่กลืน error

### 4.2 หน้าจอ
`src` เริ่มที่ variant → `onError` เปลี่ยนเป็นต้นฉบับ → `onError` อีกครั้งจึงเข้าสถานะ "ไม่มีรูป" เดิม

---

## 5. Integration Points

| จุดเชื่อม | สัญญา |
|-----------|-------|
| `/api/files/[...fileId]` | ไม่แก้ — variant เป็นเพียงคีย์อื่นในบัคเก็ตเดียวกัน ได้ header/CDN เดิม |
| feature 00051 (dedup) | **ไม่เกี่ยวกัน** — variant ไม่ผ่าน `writeDedupedFile` (เหตุผลใน TD-003) |
| feature 00053 | หน้าร้านที่เพิ่งแก้ไปเป็นผู้ใช้รายแรกของ `thumb` |

---

## 6. Technical Decisions

### TD-001: variant เป็น "ไฟล์ที่เพิ่มเข้ามา" ไม่ใช่ "ไฟล์ที่แทนที่"
ผู้ใช้สั่งเป็นกฎถาวรว่าห้ามลบอะไรโดยไม่บอกก่อน การเขียนทับต้นฉบับด้วยไฟล์ที่ย่อแล้วคือการลบข้อมูลที่กู้ไม่ได้ แลกกับพื้นที่ที่โตขึ้น ~60% ต่อรูป ซึ่งถูกกว่าความเสี่ยงมาก

### TD-002: คีย์ derive ได้ ไม่เก็บคอลัมน์ใหม่
ทางเลือกที่ปฏิเสธ: เพิ่ม `thumbFileId` ลงทุกตารางที่มีรูป (Product/Room/Shop/User) = 4 migration + ต้องเขียนค่าทุกจุดที่สร้างรูป + ยังต้อง backfill อยู่ดี
คีย์ที่ derive ได้ให้ผลเท่ากันโดยไม่แตะ schema เลย และรูปเก่าที่ยังไม่ backfill ตกไป fallback ได้เองโดยไม่ต้องมีสถานะ "รอ backfill" ใน DB
ราคาที่จ่าย: ฝั่งเบราว์เซอร์ไม่รู้ล่วงหน้าว่ามี variant ไหม ต้องยิงแล้วดู — ยอมรับได้เพราะ 404 ของ CDN ถูกและเกิดเฉพาะช่วงก่อน backfill เสร็จ

### TD-003: ไม่ใช้ `writeDedupedFile` ของ 00051
ตัวนั้น scope ด้วย `shopId` และ **คืนคีย์ของไฟล์เดิมเมื่อเนื้อซ้ำ** — ถ้าใช้กับ variant จะได้คีย์ที่ไม่ตรงกับสูตร `variantKey()` ที่ฝั่งเบราว์เซอร์คำนวณเอง ⇒ หน้าจอขอไฟล์ที่ไม่มีอยู่จริงตลอดกาล (และเราจะไม่รู้เลยเพราะมันตกไป fallback เงียบ ๆ)

### TD-004: allow-list ที่ `purpose` ไม่ใช่ deny-list
ด่านสิทธิ์ใน `/api/files/*` ตรวจจาก **คีย์ต้นฉบับ** เท่านั้น ⇒ ถ้าเผลอสร้าง variant ให้เอกสาร KYC คีย์นั้นจะถูกเสิร์ฟเป็นไฟล์สาธารณะทันที
deny-list พังทันทีที่มีใครเพิ่ม purpose ใหม่แล้วลืมเติมรายชื่อ — allow-list พังไปทางปลอดภัย (ไม่สร้าง variant) เสมอ

### TD-005: WebP ทั้งสอง variant
เล็กกว่า JPEG ที่คุณภาพเท่ากันราว 25–35% · รองรับ Safari 14+ (2020) · ที่เหลือมี fallback เป็นต้นฉบับอยู่แล้ว
ปฏิเสธ AVIF: encode ช้ากว่ามากและรองรับแคบกว่า

### TD-006: สร้างแบบ inline ใน commit ไม่ใช่คิวเบื้องหลัง
โปรเจกต์นี้ไม่มีระบบคิวงาน การสร้างคิวเพื่องานนี้อย่างเดียวคือโครงสร้างใหม่ทั้งชุดที่ต้องดูแลต่อ
รูปสินค้าปกติ (~200 KB–2 MB) ใช้เวลา sharp หลักสิบถึงร้อยมิลลิวินาที — ยอมรับได้ในคำขอที่ผู้ใช้กำลังรออยู่แล้ว
🛑 ถ้าวันหนึ่งเพดานรูปโตขึ้นมาก ต้องกลับมาวัดใหม่ (NFR-1)

---

## 7. Traceability

| TFR | ชิ้นงาน |
|-----|---------|
| TFR-001 | `variantKey`, `variantUrlOf` |
| TFR-002 | `IMAGE_VARIANTS`, `buildImageVariant` |
| TFR-003 | hook ใน `uploads/commit/route.ts` |
| TFR-004 | `saveFileAtKey` ทั้งสอง driver |
| TFR-005 | `ProductCard`, `ProductLightbox`, `PublicRoomList` |
| TFR-006 | `scripts/backfill-image-variants.ts` |

---

## 8. สรุป
โครงเรียบ: ตารางสเปกหนึ่งตาราง ฟังก์ชันบริสุทธิ์สองตัว primitive เขียนไฟล์หนึ่งตัว hook หนึ่งจุด และการเปลี่ยน `src` ที่หน้าจอสามจุด — ความเสี่ยงจริงมีข้อเดียวคือ **ห้ามให้ไฟล์ที่มีด่านสิทธิ์มี variant** ซึ่งกันด้วย allow-list + เทส
