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
}

export type SummaryData = {
  total: number
  avgRating: number // ทศนิยม 1 ตำแหน่ง
  distribution: Record<1 | 2 | 3 | 4 | 5, number> // จำนวนต่อดาว
}
