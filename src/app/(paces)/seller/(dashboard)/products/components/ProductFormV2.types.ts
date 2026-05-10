// shared types สำหรับ ProductFormV2 และ sub-cards
export type ProductTypeV2 = 'PHYSICAL' | 'DIGITAL' | 'SERVICE'

export type ProductFormV2Values = {
  name: string
  // shortDescription = teaser/หัวข้อย่อย ใช้แสดงใน card ผลค้นหา (max 200)
  shortDescription: string
  // description = คำอธิบายเต็ม (max 5000 — ขยายตาม validations.ts)
  description: string
  price: number
  type: ProductTypeV2
  images: string[]
  // tags = array ของ "ชื่อ tag" (ไม่ใช่ id) — server upsert ลง Tag table
  tags: string[]
  // attributes = key-value (เช่น สี: แดง) — เก็บเป็น Record ตรงตาม API
  attributes: Record<string, string>
}
