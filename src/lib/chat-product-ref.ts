/**
 * การ์ดสินค้าใบเดียวของข้อความแชทหนึ่งแถว — แถวเก่าเก็บที่ `productRefId` ส่วนการส่งออก LINE/Meta
 * เก็บเป็น `productRefIds=[id]` เสมอ (ใบเดียวก็เป็น array) ⇒ ต้องอ่านทั้งสองช่องที่นี่ที่เดียว
 * array ที่มี ≥2 ใบ = carousel ไม่ใช่การ์ดใบเดียว → null
 */
export function soloProductRefId(productRefId: string | null | undefined, productRefIds: readonly string[] | null | undefined): string | null {
  if (productRefId) return productRefId
  return productRefIds?.length === 1 ? productRefIds[0]! : null
}
