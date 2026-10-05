/**
 * draft-issues — ตรวจฉบับร่างฝั่ง client ก่อนเปิดปุ่มบันทึก (feature 00070 EXT · spec §3.5/§6.5) · pure
 *
 * server ยังเป็นด่านจริง (validateTemplate + ขนาด + METRIC_REQUIRED + PROFIT_CONFIRM) — ที่นี่กันไม่ให้ผู้ใช้เจอ error จากปุ่มที่ไม่ควรกดได้
 * ลำดับเหตุที่รายงานเป็น "เหตุแรก" = ลำดับที่ผู้ใช้แก้ได้ง่ายสุดก่อน
 */
import { validateTemplate } from '@/lib/line-report/validations'
import { METRIC_REQUIRED_HELPER } from '@/lib/line-report/settings-guards'
import { authoredLength, deriveFlags, MAX_BUTTON_LABEL, MAX_TEXT_LENGTH, MAX_TITLE_LENGTH, parseMarkup, type TemplateV1 } from '@/lib/line-report/template'
import { profitNeedsConfirmation } from './confirm-profit'

export const EMPTY_TEXT_HINT = 'พิมพ์ข้อความก่อนบันทึก'
export const PROFIT_TOKEN_HINT = 'ตัวแปร {กำไร} ใช้ได้หลังเปิดแสดงกำไรแล้ว กดเพื่อเปิดและยืนยัน'

export type DraftIssues = {
  /** ข้อความ error ต่อบล็อกข้อความ (markup ผิด / ยาวเกิน) */
  textErrors: Record<string, string>
  /** บล็อกข้อความที่ยังว่าง */
  emptyTextIds: string[]
  /** {กำไร} อยู่ในฉบับร่างแต่ยังไม่ยืนยัน */
  profitUnconfirmed: boolean
  /** ไม่มีตัวเลขเลย (กราฟ/ข้อความอย่างเดียว) */
  metricMissing: boolean
  /** เหตุแรกที่บันทึกไม่ได้ — null = บันทึกได้ */
  firstReason: string | null
}

export function analyzeDraft(input: {
  draft: TemplateV1
  markupById: Readonly<Record<string, string>>
  saved: TemplateV1
  profitConfirmed: boolean
  /** gaugeState().blocksSave */
  tooLarge: boolean
  tooLargeReason: string | null
}): DraftIssues {
  const { draft } = input
  const textErrors: Record<string, string> = {}
  const emptyTextIds: string[] = []
  for (const b of draft.blocks) {
    if (b.type !== 'text') continue
    const src = input.markupById[b.id] ?? ''
    const parsed = parseMarkup(src)
    if (!parsed.ok) textErrors[b.id] = parsed.message
    else {
      const len = authoredLength(parsed.runs)
      if (len > MAX_TEXT_LENGTH) textErrors[b.id] = `เกิน ${len - MAX_TEXT_LENGTH} ตัวอักษร`
      if (!parsed.runs.some((r) => 'tok' in r || r.t.trim() !== '')) emptyTextIds.push(b.id)
    }
  }
  const drafted = deriveFlags(draft)
  const metricMissing = !(drafted.showOrders || drafted.showSales || drafted.showCancelled || drafted.showTopProducts || drafted.showProfit)
  const profitUnconfirmed = profitNeedsConfirmation(deriveFlags(input.saved), drafted, input.profitConfirmed)

  const titleLen = draft.title === undefined ? 0 : Array.from(draft.title).length
  let firstReason: string | null = null
  const firstTextError = Object.values(textErrors)[0]
  if (firstTextError) firstReason = firstTextError
  else if (emptyTextIds.length > 0) firstReason = EMPTY_TEXT_HINT
  else if (metricMissing) firstReason = METRIC_REQUIRED_HELPER
  else if (profitUnconfirmed) firstReason = PROFIT_TOKEN_HINT
  else if (titleLen > MAX_TITLE_LENGTH) firstReason = `ชื่อรายงานยาวเกิน ${MAX_TITLE_LENGTH} ตัวอักษร`
  else if (draft.button.label.trim() === '' || Array.from(draft.button.label).length > MAX_BUTTON_LABEL) firstReason = `ป้ายปุ่มต้องไม่ว่างและไม่เกิน ${MAX_BUTTON_LABEL} ตัวอักษร`
  else if (input.tooLarge) firstReason = input.tooLargeReason
  else if (!validateTemplate(draft).ok) firstReason = 'ข้อมูลเทมเพลตไม่ถูกต้อง โหลดหน้านี้ใหม่แล้วลองอีกครั้ง'
  return { textErrors, emptyTextIds, profitUnconfirmed, metricMissing, firstReason }
}
