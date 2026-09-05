import { NextResponse } from 'next/server'
import * as v from 'valibot'
import { RecordInspectionResultsSchema } from '@/lib/validations'
import { isInspectionCheckKey } from '@/lib/inspection/checks'
import { recordRoundResults } from '@/services/inspection-round.service'
import { inspectorError, mapInspectorError, requireInspector } from '../../../_shared'

/**
 * POST /api/inspector/rounds/[id]/results — บันทึกผลทั้งชุดในคำขอเดียว (API §4.8)
 *
 * 🛑 **ยิงเป็นชุด ไม่ใช่ทีละข้อ** — รอบ onsite มีได้ถึง 6 ข้อ การยิงทีละข้อทำให้เกิดสถานะ
 *    "บันทึกไปแล้ว 4 จาก 6 แล้วเน็ตหลุด" ซึ่งแก้ยากที่สุดสำหรับคนที่ยืนอยู่หน้างาน
 *    และมันคือเหตุผลที่ bucket ของ rate-limit พอสำหรับสัญญานี้ แต่จะไม่พอทันทีถ้าเปลี่ยนไปยิงรายข้อ
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireInspector()
  if ('response' in auth) return auth.response
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(RecordInspectionResultsSchema, body)
  if (!parsed.success) return inspectorError('VALIDATION_ERROR', { message: parsed.issues[0]?.message })

  // allow-list 18 คีย์ก่อนเข้า service — คีย์ที่ไม่รู้จักต้องได้คำตอบของตัวเอง ไม่ใช่ 500
  for (const r of parsed.output.results) {
    if (!isInspectionCheckKey(r.checkKey)) return inspectorError('UNKNOWN_CHECK_KEY')
  }

  try {
    const result = await recordRoundResults({
      roundId: id,
      inspectorUserId: auth.userId,
      results: parsed.output.results.map((r) => ({
        checkKey: r.checkKey as Parameters<typeof recordRoundResults>[0]['results'][number]['checkKey'],
        outcome: r.outcome,
        note: r.note,
        evidence: r.evidence,
      })),
      suspectedFraudNote: parsed.output.suspectedFraudNote,
      now: new Date(),
    })
    return NextResponse.json({
      saved: result.saved.length,
      // `changed` บอกผู้ตรวจว่าสิ่งที่เพิ่งบันทึกถูกตีความอย่างไร — คนที่ตั้งใจแก้ผลแล้วเห็น
      // `changed: false` จะรู้ทันทีว่าเลือก outcome เดิมโดยไม่ตั้งใจ ซึ่งถ้าไม่บอกตอนนี้
      // จะไม่มีใครเจออีกเลย (แถวไม่เพิ่ม ไทม์ไลน์ไม่ขยับ ไม่มีอะไรผิดปกติให้สังเกต)
      results: result.saved.map((s) => ({
        checkKey: s.checkKey,
        outcome: s.outcome,
        changed: s.changed,
        evidenceIds: s.evidenceIds,
      })),
    })
  } catch (e) {
    return mapInspectorError(e, { tag: 'inspector/rounds/results', roundId: id })
  }
}
