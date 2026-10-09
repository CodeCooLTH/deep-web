/** ชื่อ event ข้าม component (CustomerPanel อยู่คนละต้นไม้กับ ChatThread จึงส่ง callback ผ่าน prop ไม่ได้) */
export const PRODUCT_TRAY_OPEN_EVENT = 'deep:product-tray-open' // detail { productId: string }
export const MEMORY_POKE_EVENT = 'deep:memory-poke'

/** แผงลูกค้า → เธรด: เปิดถาดสินค้าที่ productId นี้ */
export function dispatchProductTrayOpen(productId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PRODUCT_TRAY_OPEN_EVENT, { detail: { productId } }))
}

/** หลังส่งข้อความ/ลูกค้าตอบ: บอกแผงให้ดึงความจำใหม่ (AI อาจเพิ่งเริ่มอัปเดต) */
export function dispatchMemoryPoke(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MEMORY_POKE_EVENT))
}
