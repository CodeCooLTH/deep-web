// ประเภทข้อมูลรีวิวที่ส่งผ่าน RSC → client boundary
// dateISO เก็บเป็น ISO string เพื่อป้องกัน Date object ข้ามขอบเขต RSC
export type ReviewRow = {
  id: string
  reviewerLabel: string
  reviewerInitial: string
  rating: number
  comment: string | null
  dateISO: string // ISO 8601 — format เป็นไทยใน client component
  productName: string
  orderToken: string // สำหรับ link ไป /seller/orders/{token} (internal)
  // feature 00041 — รูปที่ผู้ซื้อแนบมากับรีวิว (≤4 ใบ) เป็น fileId → `/api/files/{id}`
  images: string[]
  // feature 00041 — คำตอบของร้าน (null = ยังไม่ตอบ) ตอบซ้ำ = เขียนทับ ไม่ใช่แถวใหม่
  shopReply: { comment: string; repliedAtISO: string } | null
}

export type SummaryData = {
  total: number
  avgRating: number // ทศนิยม 1 ตำแหน่ง
  distribution: Record<1 | 2 | 3 | 4 | 5, number> // จำนวนต่อดาว
}
