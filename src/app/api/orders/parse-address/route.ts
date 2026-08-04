import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateText } from '@/lib/gemini'
import { parseOrderMessage, type ParsedOrderMessage } from '@/lib/parse-order-message'

/**
 * POST /api/orders/parse-address — ให้ AI แยก ชื่อ/เบอร์/ที่อยู่ จากข้อความที่ร้านเลือกเอง
 *
 * body: { text: string }  → { parsed: ParsedOrderMessage }
 *
 * WARNING: เส้นทางนี้เป็น **ข้อยกเว้นที่ user อนุมัติไว้ 2026-08-04** ของข้อตกลง "ห้ามส่ง phone/email/
 * address ของลูกค้าเข้า AI" (feature 00019 ข้อ 3 / BR-AI-09) ขอบเขตของข้อยกเว้น:
 *   1. ส่งได้เฉพาะ **ข้อความก้อนที่ร้านกดส่งเอง** จากชีต "กระจายที่อยู่" — ไม่ใช่ระบบส่งอัตโนมัติ
 *      เมื่อ parser ปกติพลาด (parser rule-based ยังเป็นค่าตั้งต้นเสมอ)
 *   2. ไม่แนบบริบทอะไรเพิ่มเลย — ไม่มีชื่อร้าน สินค้า ราคา ประวัติแชท หรือข้อมูลลูกค้าจากฐาน
 *      (ต่างจาก ai-context.service.ts ที่ประกอบบริบทร้าน — ห้ามเรียกจากที่นี่)
 *   3. คืนค่าเป็นฟิลด์ที่อยู่เท่านั้น ไม่เก็บ log เนื้อหาข้อความ
 * ถ้าจะขยายเกินนี้ (เช่นให้ AI อ่านที่อยู่เองทุกครั้ง) ต้องกลับไปแก้ PRD/BRD ก่อน ไม่ใช่แก้ที่นี่
 *
 * ผลลัพธ์ถูก merge ทับผล parser เดิม ไม่ใช่แทนที่ทั้งก้อน: parser รู้จักการสะกดจังหวัดตามชุดข้อมูล
 * iShip (77 จังหวัด) ซึ่งเชื่อถือได้กว่าคำที่โมเดลสะกดเอง — ค่าจาก AI ใช้เฉพาะช่องที่ parser ว่าง
 */
export const dynamic = 'force-dynamic'

const MAX_TEXT_LENGTH = 2000

const SYSTEM_PROMPT = `คุณคือตัวแยกข้อมูลที่อยู่จัดส่งจากข้อความภาษาไทยที่ลูกค้าพิมพ์มาในแชท
ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น ไม่มี markdown code fence
รูปแบบ: {"name":"","phone":"","addressLine":"","subdistrict":"","district":"","province":"","postcode":""}
กติกา:
- ไม่พบข้อมูลช่องไหน ให้ใส่ค่าว่าง ห้ามเดา ห้ามแต่งขึ้นเอง
- phone = ตัวเลขล้วน 9-10 หลัก ตัดขีด/เว้นวรรค/คำว่า "โทร" ออก
- addressLine = บ้านเลขที่ หมู่ ซอย ถนน หมู่บ้าน อาคาร (ไม่รวมตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์)
- subdistrict/district = ชื่อล้วน ไม่ต้องมีคำนำหน้า ต./แขวง/อ./เขต
- province = ชื่อจังหวัดล้วน ไม่ต้องมีคำว่า "จังหวัด" (กรุงเทพมหานคร/กทม. ให้ตอบว่า "กรุงเทพ")
- postcode = เลข 5 หลัก`

/** อ่าน JSON จากคำตอบโมเดล — เผื่อมี code fence หรือข้อความห้อยท้ายติดมา */
function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as unknown
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const str = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let text: string
  try {
    const body = (await request.json()) as { text?: unknown }
    if (typeof body.text !== 'string' || body.text.trim().length === 0) {
      return NextResponse.json({ error: 'ไม่มีข้อความให้อ่าน' }, { status: 400 })
    }
    // จำกัดความยาว: ข้อความที่อยู่จริงยาวไม่ถึงนี้ ที่เกินมาคือการยัดบทสนทนาทั้งเธรดเข้าโมเดล
    if (body.text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'ข้อความยาวเกินไป ตัดให้เหลือเฉพาะส่วนที่อยู่' }, { status: 400 })
    }
    text = body.text
  } catch {
    return NextResponse.json({ error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }

  // parser rule-based เป็นฐานเสมอ — AI มาเติมช่องที่ยังว่าง ไม่ทับของที่จับได้แน่นอนแล้ว
  const base = parseOrderMessage(text)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const { text: out } = await generateText({
      system: SYSTEM_PROMPT,
      user: text,
      maxOutputTokens: 512,
      temperature: 0,
      signal: controller.signal,
    })
    const json = extractJson(out)
    if (!json) {
      return NextResponse.json({ error: 'AI ตอบมาในรูปแบบที่อ่านไม่ได้ ลองอีกครั้ง' }, { status: 502 })
    }
    const merged: ParsedOrderMessage = {
      name: base.name ?? str(json.name),
      phone: base.phone ?? str(json.phone),
      addressLine: base.addressLine ?? str(json.addressLine),
      subdistrict: base.subdistrict ?? str(json.subdistrict),
      district: base.district ?? str(json.district),
      province: base.province ?? str(json.province),
      postcode: base.postcode ?? str(json.postcode),
    }
    return NextResponse.json({ parsed: merged }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    // ไม่ log เนื้อข้อความ (มีเบอร์/ที่อยู่ลูกค้าอยู่) — log เฉพาะสาเหตุ
    console.error('[POST /api/orders/parse-address]', msg || 'unknown error')
    if (msg.includes('GEMINI_API_KEY')) {
      return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่า AI ในระบบ' }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI อ่านไม่สำเร็จ ลองแก้ในช่องแล้วกดแยกข้อมูลเองได้' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
