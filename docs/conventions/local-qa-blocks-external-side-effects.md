# Browser QA บนฐาน local ต้องกันการยิงออกภายนอกก่อนกดปุ่ม

**กฎ:** dev server ที่ใช้ทำ browser QA ซึ่งจะกดปุ่มที่ส่งแจ้งเตือน/ข้อความ (push, Messenger, LINE, ส่งข้อความอัตโนมัติ) ต้องเปิดด้วย

```bash
NODE_OPTIONS="--require ./scripts/qa-block-external.cjs" \
DATABASE_URL=postgresql://safepay:safepay@localhost:5434/safepay \
DIRECT_URL=postgresql://safepay:safepay@localhost:5434/safepay \
STORAGE_DRIVER=local npx next dev --turbopack -p 3011
```

และ brief ของ QA agent ทุกตัวต้องมีบรรทัดนี้

## ทำไม

- ฐาน local 5434 copy มาจากข้อมูลจริง (`scripts/clone-prod-to-local.sh`) — มี Expo push token จริงของเจ้าของ/ผู้จัดการร้านจริง (พบ 8 ตัว 2026-10-29) และห้องแชทที่ผูกเพจ/LINE จริง
- "ฐาน local" ไม่ได้แปลว่า "ปลอดภัย" — ฐานอยู่ในเครื่อง แต่ push/Messenger/LINE เป็นบริการภายนอกจริง ไม่มีอะไรกั้นระหว่างกลาง
- เคสจริง: 00086 QA กดรับงาน/เริ่ม/เสร็จ/ปิด 12 ครั้ง — ทุกครั้งเรียก `pushToUsers` ไปหาผู้จัดการจริง · guard ดักได้ครบเพราะเปิดไว้ก่อน (log `$TMPDIR/qa-blocked-external.log`)

## วิธีเช็กว่า guard ทำงาน

1. ก่อนลองจริง: สร้าง shop canary + push token ปลอม แล้วกดหนึ่งครั้ง → ต้องเห็นบรรทัด `BLOCKED` ใน log
2. ห้ามเปิดสวิตช์ส่งข้อความอัตโนมัติในร้านจริงบน local — ถ้าต้องทดสอบ ใช้ห้องแชทช่อง DEEP ที่สร้างเป็น fixture แล้วตรวจที่ ledger

## เกี่ยวข้อง

- HR13/HR14 (ฐาน prod) — กฎนี้คือด้าน "คนจริง" ของเรื่องเดียวกัน
- `docs/retro/2026-10-29-00086-service-staff-workflow-retrospective.md`
