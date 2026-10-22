-- 00083 ext (user 2026-10-22): เพดานคำต่อแท็ก 10 → 50
-- แถวเดิมทุกแถว ≤10 คำ ⇒ ผ่าน CHECK ใหม่แน่นอน · เพิ่มตัวใหม่ก่อนแล้วค่อยถอดตัวเก่า ไม่มีช่วงที่ไม่มีเพดาน
ALTER TABLE "ShopTag" ADD CONSTRAINT "ShopTag_keywords_max50" CHECK (cardinality("keywords") <= 50);
ALTER TABLE "ShopTag" DROP CONSTRAINT "ShopTag_keywords_max10";
