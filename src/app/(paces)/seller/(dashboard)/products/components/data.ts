export type ProductRow = {
  id: string
  name: string
  description: string
  image: string
  price: number
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'SUBSCRIPTION'
  isActive: boolean
  totalSold: number
  reviews: number
  rating: number
  /** ISO string — แปลงจาก Date ที่ server boundary ก่อนส่ง prop มา client */
  createdAt: string
}
