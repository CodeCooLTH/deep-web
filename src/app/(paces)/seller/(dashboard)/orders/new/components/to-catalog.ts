/**
 * toCatalogProduct — map Product (Prisma) → CatalogProduct ที่ OrderCreateForm ใช้
 *
 * แยกออกมาเป็นไฟล์กลางเพราะมี 2 หน้าที่ต้อง map เหมือนกันเป๊ะ:
 *   - (fullscreen)/orders/new/page.tsx        (สร้างออเดอร์)
 *   - (fullscreen)/orders/[token]/edit/page.tsx (แก้ไขออเดอร์)
 * ถ้าปล่อยให้ copy กันไว้คนละหน้า catalog จะ drift (เช่นเพิ่ม field ใหม่ที่เดียว)
 */
import type { CatalogProduct } from './OrderCreateForm'

export function toCatalogProduct(p: any): CatalogProduct {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    price: Number(p.price),
    type: p.type,
    fulfillmentMode: p.fulfillmentMode,
    image: Array.isArray(p.images) && p.images.length > 0 ? `/api/files/${p.images[0]}` : null,
    // sku: ใช้ค้นหาใน ProductPickerSheet (ชื่อ+SKU) — optional
    sku: p.sku ?? null,
    // stockQty: NULL = untracked (ไม่โชว์สต็อก), number = tracked
    stockQty: p.stockQty ?? null,
  }
}
