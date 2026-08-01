'use client'

/**
 * AI Enhance ของกลุ่มคำ — สวิตช์เปิด/ปิด + อธิบายว่าเปิดแล้วเกิดอะไร
 * feature 00023 · phase `00023-ai-enhance`
 *
 * Base: settings/auto-reply/[id]/KeywordEditorClient.tsx (โครง .card / .card-header /
 *   form-switch / pacesToast) — ไม่สร้าง pattern ใหม่
 *
 * WARNING (สถานะจริงตอนนี้): สวิตช์นี้ "บันทึกได้จริง" แล้ว แต่ **ยังไม่มีโค้ดฝั่งตอบ
 * ที่อ่านค่านี้ไปใช้** — A-04 (เรียก AI + งบ 8 วิ) และ A-08 (เสียบเข้า processJob) ยังไม่ทำ
 * จึงต้องบอกผู้ใช้ตรง ๆ ในหน้า ไม่ใช่ปล่อยให้เปิดแล้วเข้าใจว่าทำงานแล้ว
 * ลบข้อความ "ยังไม่เริ่มทำงาน" ออกเมื่อ A-08 ขึ้น production แล้วเท่านั้น
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

type Props = {
  keywordId: string
  keywordName: string
  canEdit: boolean
  initialEnabled: boolean
}

export default function AiEnhanceClient({ keywordId, keywordName, canEdit, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    if (!canEdit || saving) return
    const next = !enabled
    setEnabled(next) // optimistic — สวิตช์ต้องขยับทันที ไม่งั้นผู้ใช้กดซ้ำ
    setSaving(true)
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${keywordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiEnhanceEnabled: next }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'บันทึกไม่สำเร็จ')
      }
      pacesToast.success(next ? 'เปิด AI Enhance ให้กลุ่มนี้แล้ว' : 'ปิด AI Enhance ของกลุ่มนี้แล้ว')
    } catch (e) {
      setEnabled(!next) // ย้อนกลับให้ตรงความจริง
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header items-start">
          <div className="min-w-0">
            <h5 className="text-default-900 flex items-center gap-2 text-lg font-semibold">
              <span className="bg-primary/15 text-primary flex size-8 flex-none items-center justify-center rounded-lg">
                <Icon icon="sparkles" className="size-4.5" aria-hidden="true" />
              </span>
              ให้ AI เรียบเรียงคำตอบก่อนส่ง
            </h5>
            <p className="text-default-700 mt-1.5 text-xs">
              คำตอบที่คุณเขียนไว้ในกลุ่ม &ldquo;{keywordName}&rdquo; จะถูก AI ปรับถ้อยคำให้อ่านลื่นขึ้นก่อนส่งถึงลูกค้า
            </p>
          </div>
          <label className="flex flex-none items-center gap-2">
            <span className="text-default-700 text-sm">{enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
            <input
              type="checkbox"
              className="form-switch"
              checked={enabled}
              disabled={!canEdit || saving}
              onChange={toggle}
              aria-label="เปิดใช้ AI Enhance สำหรับกลุ่มคำนี้"
            />
          </label>
        </div>

        <div className="card-body space-y-3">
          <ul className="text-default-700 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Icon icon="shield-check" className="text-success mt-0.5 size-4 flex-none" aria-hidden="true" />
              <span>
                <strong>ข้อมูลไม่เปลี่ยน</strong> — ราคา วันส่ง เงื่อนไข ต้องตรงกับที่คุณเขียนไว้เป๊ะ
                AI แต่งได้แค่ถ้อยคำ ห้ามเพิ่มหรือตัดข้อมูล
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Icon icon="clock" className="text-default-400 mt-0.5 size-4 flex-none" aria-hidden="true" />
              <span>
                <strong>ลูกค้าไม่ต้องรอ</strong> — ถ้า AI ใช้เวลาเกิน 8 วินาที ระบบจะส่งคำตอบเดิมที่คุณเขียนไว้แทนทันที
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Icon icon="coin" className="text-default-400 mt-0.5 size-4 flex-none" aria-hidden="true" />
              <span>
                <strong>คิดตามที่ใช้จริง</strong> — หักจากเครดิตในกระเป๋าตามต้นทุนจริงต่อครั้ง
                และหยุดเองเมื่อถึงเพดานค่าใช้จ่ายต่อวันที่คุณตั้งไว้
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* WARNING: ป้ายนี้ต้องอยู่จนกว่า A-08 (เสียบเข้าเส้นทางตอบจริง) จะขึ้น production
          ปล่อยให้ร้านเปิดสวิตช์แล้วเข้าใจว่าทำงานแล้วทั้งที่ยังไม่ทำ = โกหกผู้ใช้ */}
      <div className="card">
        <div className="card-body flex items-start gap-3">
          <Icon icon="alert-triangle" className="text-warning mt-0.5 size-5 flex-none" aria-hidden="true" />
          <div className="text-sm">
            <p className="text-default-800 font-semibold">ยังไม่เริ่มทำงานจริง</p>
            <p className="text-default-700 mt-1">
              ตอนนี้เปิดสวิตช์ไว้ล่วงหน้าได้ แต่ระบบยังส่งคำตอบเดิมของคุณตามปกติ
              ส่วนที่ให้ AI เรียบเรียงและกฎห้ามตอบกำลังพัฒนาอยู่ — จะแจ้งเมื่อเริ่มใช้ได้จริง
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
