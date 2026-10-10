export type CategoryRow = {
  key: 'PHYSICAL' | 'DIGITAL' | 'SERVICE'
  label: string
  description: string
  icon: string
  iconClass: string
  productCount: number
  activeCount: number
  orderCount: number
  /** ไม่มีคีย์ = ผู้ดูไม่ใช่เจ้าของร้าน (00071) */
  revenue?: number
}
