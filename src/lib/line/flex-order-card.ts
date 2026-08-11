/**
 * flex-order-card — การ์ดคำสั่งซื้อที่ลูกค้าเห็นในแอป LINE (ส่วนขยาย 2026-08-11)
 *
 * ก่อนหน้านี้ร้านกด "ส่งการ์ดออเดอร์" แล้วลูกค้า LINE ได้ **ข้อความเปล่า 3 บรรทัดกับลิงก์ดิบ**
 * (ฝั่งร้านเห็นเป็นการ์ดสวยงามในระบบเรา ฝั่งลูกค้าเห็นลิงก์) — สำหรับโปรดักต์ที่นิยามตัวเองว่า
 * "LINE = ทางเข้าของออเดอร์" นี่คือจุดที่ห่างจากเจตนามากที่สุด
 *
 * ข้อบังคับ: ไฟล์นี้ต้อง **pure** — รับค่าที่ฟอร์แมตแล้ว คืน JSON ล้วน ห้ามรู้จัก prisma/storage/เงิน
 * 🛑 โดยเฉพาะ "การฟอร์แมตเงิน" ห้ามทำที่นี่ (HR16) — ผู้เรียกส่ง `totalText` ที่ผ่านสูตรกลางของระบบ
 * มาแล้ว ไม่งั้นยอดบนการ์ดที่ลูกค้าเห็นจะเพี้ยนจากยอดบนหน้าจอร้านได้โดยไม่มีอะไรฟ้อง
 *
 * สี: ยึด `.impeccable/design.json` ฝั่ง **ผู้ซื้อ** เพราะการ์ดนี้ไปโผล่ในแอป LINE ของลูกค้า
 * ไม่ใช่ในหน้าจอร้าน (ห้ามใช้ `paces-primary` น้ำเงินซึ่งเป็นสีของ surface ฝั่งผู้ขาย — HR7)
 */

/** #7367F0 — `extensions.colorMeta.primary.canonical` (แบรนด์ Deep ฝั่งผู้ซื้อ) */
const BRAND = '#7367F0'
/** #2F2B3D — Ink Plum ไม่ใช่ดำสนิท (design.json: ห้ามใช้ #000) */
const INK = '#2F2B3D'
/** #808390 — slate สำหรับป้ายกำกับที่ไม่ใช่เนื้อหาหลัก */
const SLATE = '#808390'

/** LINE จำกัด altText ที่ 1500 ตัวอักษร — ตัดที่ฝั่งเราเองไม่ปล่อยให้ LINE ปฏิเสธทั้งข้อความ */
const ALT_TEXT_MAX = 1500

/** ป้ายบนปุ่มของ action object จำกัด 20 ตัวอักษร — เกินแล้ว LINE ตีข้อความตกทั้งใบ */
const BUTTON_LABEL = 'เปิดคำสั่งซื้อ'

export interface LineFlexOrderCardInput {
  /** ชื่อรายการแรกของออเดอร์ */
  title: string
  /** จำนวนรายการที่เหลือนอกจากชิ้นแรก — 0 = ไม่ต้องขึ้นบรรทัด "และอีก n รายการ" */
  extraItemCount: number
  /** ยอดสุทธิที่ฟอร์แมตมาแล้ว เช่น `฿1,590` — ห้ามส่งตัวเลขดิบมาให้ไฟล์นี้ฟอร์แมตเอง (HR16) */
  totalText: string
  /** ลิงก์หน้าออเดอร์สาธารณะ — **ต้องเป็น https** (LINE ปฏิเสธ uri action ที่ไม่ใช่ https) */
  url: string
}

export interface LineFlexMessage {
  altText: string
  contents: Record<string, unknown>
}

/**
 * ประกอบ bubble ของการ์ดคำสั่งซื้อ
 *
 * 🛑 `altText` ไม่ใช่ของประดับ — มันคือสิ่งที่ลูกค้าเห็นใน **รายการแชทและ notification**
 * (ตัว flex ไม่ถูกเรนเดอร์ในสองที่นั้น) ถ้าเขียนว่า "ข้อความจากร้าน" ลอย ๆ ลูกค้าจะไม่มีทางรู้เลย
 * ว่ามีออเดอร์เข้ามาจนกว่าจะเปิดห้องแชท — ต้องมีทั้งของและยอดเงินอยู่ในนั้น
 */
export function buildLineFlexOrderCard(input: LineFlexOrderCardInput): LineFlexMessage {
  const bodyContents: Record<string, unknown>[] = [
    { type: 'text', text: 'คำสั่งซื้อ', size: 'sm', color: SLATE },
    { type: 'text', text: input.title, weight: 'bold', size: 'lg', color: INK, wrap: true },
  ]

  if (input.extraItemCount > 0) {
    bodyContents.push({
      type: 'text',
      text: `และอีก ${input.extraItemCount} รายการ`,
      size: 'sm',
      color: SLATE,
    })
  }

  bodyContents.push(
    { type: 'separator', margin: 'lg' },
    {
      type: 'box',
      layout: 'horizontal',
      margin: 'lg',
      contents: [
        { type: 'text', text: 'ยอดสุทธิ', size: 'sm', color: SLATE, gravity: 'center' },
        {
          type: 'text',
          text: input.totalText,
          size: 'lg',
          weight: 'bold',
          color: INK,
          align: 'end',
          wrap: true,
        },
      ],
    },
  )

  const altText = `คำสั่งซื้อ: ${input.title} · ยอดสุทธิ ${input.totalText}`.slice(0, ALT_TEXT_MAX)

  return {
    altText,
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: BRAND,
            action: { type: 'uri', label: BUTTON_LABEL, uri: input.url },
          },
        ],
      },
    },
  }
}
