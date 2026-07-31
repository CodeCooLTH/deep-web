-- ChatMessage.seq — ตัวตัดสินลำดับเมื่อ createdAt เท่ากัน (feature 00018)
--
-- ที่มา: Meta ส่ง created_time ของข้อความระบบ/การ์ดมาแค่ระดับวินาที ส่วนข้อความปกติจาก webhook
-- มีระดับมิลลิวินาที ข้อความที่เกิดวินาทีเดียวกันจึงเสมอกันหมด และการเรียงด้วย createdAt
-- อย่างเดียวให้ลำดับไม่แน่นอน — เทียบกับ Graph API แล้วพบว่าสลับกันจริง
--
-- additive ล้วน: เพิ่มคอลัมน์ + sequence + unique index ไม่แตะข้อมูลเดิม
-- แถวที่มีอยู่แล้วจะได้ค่าตามลำดับ physical ที่เก็บอยู่ ซึ่งคือลำดับที่ insert เข้ามาจริง
ALTER TABLE "ChatMessage" ADD COLUMN "seq" SERIAL;

CREATE UNIQUE INDEX "ChatMessage_seq_key" ON "ChatMessage"("seq");
