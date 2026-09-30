export const META_DATA = {
  name: 'Deep',
  title: 'Deep — ระบบสร้างความน่าเชื่อถือสำหรับการซื้อขายออนไลน์',
  description: 'Deep ช่วยสร้างความน่าเชื่อถือผ่านระบบ Verify ตัวตน, Trust Score, Badge และ Order History เพื่อแก้ปัญหามิจฉาชีพ',
  author: 'Deep Thailand',
  username: 'safepay',
  keywords: 'deep, deepthailand, trust, verification, trust score, order verification, anti-scam',
  version: '0.2.0',
}

// 🛑 ไม่มี `currentYear` แล้ว (ลบ 2026-10-01) — เดิมเป็นปี ค.ศ. และคำนวณครั้งเดียวตอนโหลดโมดูล
// (server ที่รันข้ามปีใหม่จะค้างปีเก่า) · ปีบนจอใช้ formatYearTH(new Date()) จาก @/lib/format-date

type CurrencyType = '฿' | '$' | '€'

export const currency: CurrencyType = '฿'
