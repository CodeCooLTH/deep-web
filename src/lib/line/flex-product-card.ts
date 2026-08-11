/**
 * flex-product-card — การ์ดสินค้าที่ลูกค้าเห็นในแอป LINE (ส่วนขยาย 2026-08-11)
 *
 * ก่อนหน้านี้ `type=PRODUCT` ถูกปฏิเสธด้วย 400 บนทุกช่องทางนอก ("ช่องทางนี้ยังไม่รองรับการ์ดสินค้า")
 * ผู้ขายจึงต้องพิมพ์ชื่อ+ราคาเองแล้วแนบรูปแยกอีกใบ — สองข้อความสำหรับของชิ้นเดียว
 *
 * เนื้อหายึด **การ์ดในแอป** (`ProductCardBubble`) ให้ตรงกัน: รูป · ชื่อ · ราคา · ป้าย "หยุดขายแล้ว"
 * และ **ไม่มีปุ่ม** เหมือนกัน — ระบบไม่มีหน้าสาธารณะของสินค้ารายชิ้นให้ลิงก์ไป (`/a/[id]` คือประมูล
 * ส่วนสินค้าโผล่เฉพาะในกริดของหน้าร้าน) การใส่ปุ่มที่พาไปหน้าร้านรวมคือการสร้าง affordance ที่
 * ไม่ตรงกับสิ่งที่ผู้ใช้คาดหวังจากการกด — ดู `docs/conventions/sibling-surface-parity.md`
 *
 * ข้อบังคับ: pure — รับค่าที่ฟอร์แมตแล้ว คืน JSON. การฟอร์แมตเงินเป็นหน้าที่ของ `formatBaht` (HR16)
 */

/** #7367F0 / #2F2B3D / #808390 / #F8F7FA — canonical จาก `.impeccable/design.json` ฝั่งผู้ซื้อ */
const INK = '#2F2B3D'
const SLATE = '#808390'
const SURFACE_MIST = '#F8F7FA'

const ALT_TEXT_MAX = 1500

export interface LineFlexProductCardInput {
  name: string
  /** ราคาที่ผ่าน `formatBaht` มาแล้ว เช่น `฿1,290` — ห้ามส่งตัวเลขดิบมาให้ไฟล์นี้ฟอร์แมตเอง (HR16) */
  priceText: string
  /**
   * URL รูปสินค้าที่ **LINE ดึงได้จริง** — https · JPEG/PNG · ≤10MB
   * `null` = ไม่มีรูป หรือแปลงเป็น JPEG ไม่สำเร็จ → การ์ดไม่มี hero (ยังอ่านชื่อ/ราคาได้ครบ)
   *
   * 🛑 ห้ามส่ง URL ของไฟล์ต้นฉบับที่เป็น webp/gif เข้ามา — LINE เรนเดอร์ไม่ได้และจะขึ้นเป็นกรอบว่าง
   * ซึ่งแย่กว่าไม่มีรูปเลย (ผู้เรียกต้องแปลงเป็น JPEG ก่อนเสมอ)
   */
  imageUrl: string | null
  /** false → ขึ้นป้าย "หยุดขายแล้ว" เหมือนการ์ดในแอป (FR-CTX-08) */
  isActive: boolean
}

export interface LineFlexMessage {
  altText: string
  contents: Record<string, unknown>
}

export function buildLineFlexProductCard(input: LineFlexProductCardInput): LineFlexMessage {
  const bodyContents: Record<string, unknown>[] = [
    { type: 'text', text: 'สินค้า', size: 'sm', color: SLATE },
    { type: 'text', text: input.name, weight: 'bold', size: 'lg', color: INK, wrap: true },
    { type: 'text', text: input.priceText, size: 'md', color: INK, margin: 'sm' },
  ]

  if (!input.isActive) {
    // 🛑 ความหมายไม่ขี่อยู่บน "สี" อย่างเดียว (WCAG 1.4.1) — ใช้คำเต็มบนพื้นอ่อนแทนป้ายสีแดง
    // ซึ่งบนพื้นขาวของ LINE จะได้คอนทราสต์ต่ำกว่าเกณฑ์ข้อความทุกเฉดที่ design.json มีให้
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      backgroundColor: SURFACE_MIST,
      cornerRadius: 'md',
      paddingAll: 'sm',
      contents: [{ type: 'text', text: 'หยุดขายแล้ว', size: 'sm', weight: 'bold', color: INK }],
    })
  }

  const altText = `สินค้า: ${input.name} · ${input.priceText}`.slice(0, ALT_TEXT_MAX)

  const contents: Record<string, unknown> = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents },
  }

  if (input.imageUrl) {
    // aspectMode cover + 1:1 — รูปสินค้าในระบบเป็นสัดส่วนอิสระ ถ้าใช้ fit จะได้แถบขาวข้างรูป
    // ซึ่งบนการ์ดเล็ก ๆ อ่านเหมือนรูปโหลดไม่ขึ้น
    contents.hero = {
      type: 'image',
      url: input.imageUrl,
      size: 'full',
      aspectRatio: '1:1',
      aspectMode: 'cover',
    }
  }

  return { altText, contents }
}
