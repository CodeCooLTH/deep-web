// Shape ของ react-hook-form values สำหรับ AuctionForm (create + edit ใช้ type เดียวกัน)
// ตรงกับ field name ของ CreateAuctionSchema/UpdateAuctionSchema (@/lib/validations) —
// scheduleType/startTime/endTime เป็น client-only concept ก่อนแปลงเป็น mode/startTime/endTime ตอน submit
export type AuctionFormValues = {
  title: string
  category: string // '' = ยังไม่เลือก (required ฝั่ง client แม้ server schema เป็น optional)
  productId: string // '' = ไม่เชื่อมโยงสินค้าในร้าน
  description: string
  images: string[]
  startPrice: number
  bidIncrement: number
  reservePrice: number | null
  buyNowPrice: number | null
  expectedPrice: number | null
  // scheduleType ใช้เฉพาะตอน create (กำหนด mode ที่ส่งไป POST) — edit ไม่ส่ง startTime ไปตาม
  // UpdateAuctionSchema (@/lib/validations) ที่ไม่มี field นี้เลย
  scheduleType: 'now' | 'schedule'
  startTime: string // datetime-local string ("YYYY-MM-DDTHH:mm")
  endTime: string // datetime-local string
}

/** สินค้าในร้าน — option ของ select "สินค้าในร้าน" (จาก getProductsByShop) */
export type AuctionFormProductOption = {
  id: string
  name: string
}
