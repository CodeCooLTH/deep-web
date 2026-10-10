/**
 * ตัด `items[].cost` (ต้นทุนรายบรรทัด) ออกจากออเดอร์ก่อนส่งให้ผู้ไม่ใช่เจ้าของร้าน (00071 P3 capability)
 *
 * ทำไมต้องมีที่เดียว: service คืน `include: { items: true }` ทั้งแถว แล้ว route ส่งต่อเป็น JSON ตรง ๆ —
 * ต้นทุนจึงหลุดไปกับ response ของการสร้าง/แก้/รายการออเดอร์ ทั้งที่หน้าจอไม่ได้แสดง (review T7)
 * ตัดด้วยการ "ไม่มีคีย์" ไม่ใช่ null (null = ยังไม่ตั้งต้นทุน ซึ่งเป็นข้อมูลอีกความหมาย)
 */
export function stripOrderItemCost<T extends { items?: readonly object[] }>(order: T, canSeeCost: boolean): T {
  if (canSeeCost || !order.items) return order
  return {
    ...order,
    items: order.items.map((it) => {
      const { cost: _cost, ...rest } = it as { cost?: unknown }
      return rest
    }),
  }
}
