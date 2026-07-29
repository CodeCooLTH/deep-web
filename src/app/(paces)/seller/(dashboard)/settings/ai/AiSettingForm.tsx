'use client'

/**
 * AiSettingForm — ฟอร์มตั้งค่าผู้ช่วยร่างคำตอบ AI (feature 00019, FR-001..FR-003
 * + extension 2026-07-29 usage-limit FR-AIQ-09/10)
 *
 * Base (textarea + นับตัวอักษร): src/app/(paces)/seller/(dashboard)/products/components/
 *   ProductDescriptionCardV2.tsx (`form-textarea` + counter) ซึ่ง Base เดิมมาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx:93
 * Base (สวิตช์ + คำอธิบายใต้ label): src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/
 *   components/FinanceVisibilityToggle.tsx (`form-switch` controlled + description row)
 *   ซึ่ง Base เดิมมาจาก theme/paces/.../form/elements/components/ChecksRadioSwitches.tsx:71
 * Base (banner `bg-info/15 text-info` + Icon `info-circle`): banner `!canEdit` ที่มีอยู่แล้วในไฟล์นี้
 * Base (badge soft `bg-{color}/15 text-{color}`): docs/system/ui-guideline/paces-component-reference.md §6
 *
 * toast ใช้ pacesToast เท่านั้น (Hard Rule 9) — หน้านี้อยู่ใน (paces)
 * canEdit=false (STAFF) → ทุก control เป็น disabled และไม่ render ปุ่มบันทึก (AC-003-02)
 *   แต่ความปลอดภัยจริงอยู่ที่ PUT ซึ่งตรวจ role ฝั่ง server ซ้ำเสมอ (AC-003-03)
 *
 * gate ร้าน non-paid (isPaidPlan=false, FR-AIQ-09): สวิตช์ทั้ง 3 disabled + badge "อัพเกรด/ต่ออายุแพ็กเกจ"
 * ท้ายหัวข้อ + banner เหนือกลุ่มสวิตช์ — ค่าที่แสดงเป็น "effective" (isPaidPlan ? stored : false)
 * ไม่ใช่ stored ตรง ๆ เพื่อไม่ให้ผู้ใช้เข้าใจผิดว่ายังทำงานอยู่ (BR-AIQ-14 ค่า stored ใน DB ไม่ถูกแตะ
 * — แค่ปิดการแสดง/แก้ที่ UI นี้เท่านั้น) กรณีชนกับ !canEdit (STAFF ของร้าน non-paid) — !canEdit ชนะ
 * แสดงเฉพาะ banner เดิม ไม่แสดง banner/badge อัปเกรด (STAFF จัดการ billing เองไม่ได้อยู่แล้ว)
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

/** ต้องตรงกับ Valibot ShopAiSettingSchema และ AI_INSTRUCTION_MAX_LENGTH ฝั่ง service */
const INSTRUCTION_MAX = 2000

const EXAMPLE_INSTRUCTION = `ร้านขายอะไหล่มอเตอร์ไซค์แต่ง เน้นโช้ค เบาะ ท่อ
โทน: สุภาพ เป็นกันเอง ลงท้าย "ครับ" เรียกลูกค้าว่า "พี่"
การส่ง: เคอรี่ทุกวัน ตัดรอบ 15:00 ส่งฟรีเมื่อซื้อครบ 1,000 บาท
รับประกัน: สินค้ามีปัญหาจากการผลิต เปลี่ยนได้ภายใน 7 วัน
ห้าม: รับประกันแรงม้าที่เพิ่มขึ้น, ให้ส่วนลดเกิน 5% เอง`

type Setting = {
  instruction: string
  includeProductContext: boolean
  includeCustomerContext: boolean
  includeMediaContext: boolean
}

type Props = {
  initial: Setting
  /** OWNER/ADMIN = true, STAFF = false (อ่านอย่างเดียว) */
  canEdit: boolean
  /** owner ของร้านมี BusinessPackageSubscription.status==="ACTIVE" (BR-AIQ-02) */
  isPaidPlan: boolean
  /** ร้าน non-paid ที่เคยสมัครแล้วแต่ subscription ถูกล็อกจาก renew ล้มเหลว — ใช้เลือกข้อความ badge */
  subscriptionLapsed: boolean
}

export default function AiSettingForm({ initial, canEdit, isPaidPlan, subscriptionLapsed }: Props) {
  const router = useRouter()
  const [instruction, setInstruction] = useState(initial.instruction)
  const [includeProductContext, setIncludeProductContext] = useState(initial.includeProductContext)
  const [includeCustomerContext, setIncludeCustomerContext] = useState(initial.includeCustomerContext)
  const [includeMediaContext, setIncludeMediaContext] = useState(initial.includeMediaContext)
  const [saving, setSaving] = useState(false)

  const overLimit = instruction.length > INSTRUCTION_MAX
  // ร้าน non-paid + แก้ไขได้ (ไม่ใช่ STAFF) → เห็น gate ของฟีเจอร์นี้ (banner + badge + disabled)
  // STAFF ของร้าน non-paid ยังโดน disabled จาก !canEdit อยู่แล้ว แต่ไม่ต้องเห็น banner/badge อัปเกรดซ้ำ
  const showUpgradeGate = !isPaidPlan && canEdit
  const contextGateDescribedBy = showUpgradeGate ? 'ai-context-gate-notice' : undefined

  async function handleSave() {
    if (overLimit || saving) return
    setSaving(true)
    try {
      // defense-in-depth คู่กับ backend reject (FR-AIQ-10) — ร้าน non-paid ไม่ส่ง 3 ฟิลด์บริบทเลย
      const body = isPaidPlan
        ? { instruction, includeProductContext, includeCustomerContext, includeMediaContext }
        : { instruction }
      const res = await fetch('/api/shops/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        pacesToast.error(data?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
        // sync สถานะกรณีร้าน downgrade กลางคัน (E16) — ห้ามทำเหมือนบันทึกสำเร็จเงียบ ๆ
        router.refresh()
        return
      }
      pacesToast.success('บันทึกการตั้งค่าแล้ว — คำแนะนำครั้งถัดไปจะใช้ค่าใหม่ทันที')
    } catch {
      pacesToast.error('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card-body space-y-6">
      {!canEdit && (
        <div className="bg-info/15 text-info flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="info-circle" className="mt-0.5 shrink-0 text-lg" />
          <span>คุณดูการตั้งค่านี้ได้อย่างเดียว — เฉพาะเจ้าของร้านและผู้ดูแลร้านเท่านั้นที่แก้ไขได้</span>
        </div>
      )}

      {/* ── คำสั่งประจำร้าน ── */}
      <div>
        <label htmlFor="ai-instruction" className="form-label">
          คำสั่งประจำร้าน
        </label>
        <p className="text-default-500 mb-2 text-xs">
          เขียนบอก AI ว่าร้านคุณขายอะไร พูดกับลูกค้าอย่างไร มีนโยบายส่ง/รับประกันแบบไหน และมีอะไรที่ห้ามพูด
          ยิ่งเขียนละเอียด คำแนะนำยิ่งตรงกับร้านคุณ
        </p>
        <textarea
          id="ai-instruction"
          rows={8}
          className="form-textarea"
          placeholder={EXAMPLE_INSTRUCTION}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={!canEdit || saving}
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-default-400 text-xs">
            ตัวอย่างที่แนะนำแสดงเป็นข้อความจาง ๆ ในช่อง — คัดลอกไปปรับใช้ได้
          </span>
          <span className={`text-xs ${overLimit ? 'text-danger font-semibold' : 'text-default-400'}`}>
            {instruction.length.toLocaleString()} / {INSTRUCTION_MAX.toLocaleString()}
          </span>
        </div>
        {overLimit && (
          <p className="text-danger mt-1 text-xs">
            ยาวเกิน {INSTRUCTION_MAX.toLocaleString()} ตัวอักษร กรุณาตัดให้สั้นลงก่อนบันทึก
          </p>
        )}
      </div>

      {/* ── banner บริบท AI ถูกจำกัดสำหรับร้าน non-paid (FR-AIQ-09) — วางระหว่างคำสั่งประจำร้าน
          กับกลุ่มสวิตช์ตามสเปก, copy โครง class จาก banner !canEdit ด้านบนเป๊ะ, ผูกกับกลุ่มสวิตช์
          ผ่าน aria-describedby ที่ input (ไม่ใช่ label — สวิตช์ disabled ถูก screen reader ข้าม) */}
      {showUpgradeGate && (
        <div id="ai-context-gate-notice" className="bg-info/15 text-info flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="info-circle" className="mt-0.5 shrink-0 text-lg" />
          <span>
            ตอนนี้ AI เห็นเฉพาะข้อความในแชทเท่านั้น — ให้ AI เห็นข้อมูลสินค้า ประวัติลูกค้า และรูป/เสียงที่ลูกค้าส่งมาได้เมื่อใช้แพ็กเกจธุรกิจ{' '}
            <Link href="/business" className="underline">
              ดูแพ็กเกจ
            </Link>
          </span>
        </div>
      )}

      {/* ── สวิตช์บริบท ── */}
      <div className="space-y-3">
        <label className="border-default-200 flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={`block text-sm font-medium ${isPaidPlan ? 'text-default-800' : 'text-default-500'}`}>
                ให้ AI เห็นข้อมูลสินค้า
              </span>
              {showUpgradeGate && (
                <Link
                  href="/business"
                  className={`badge ${subscriptionLapsed ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'}`}
                >
                  {subscriptionLapsed ? 'ต่ออายุแพ็กเกจ' : 'อัพเกรดแพ็กเกจ'}
                </Link>
              )}
            </span>
            <span className="text-default-500 block text-xs">
              AI จะเห็นชื่อและราคาสินค้าที่เปิดขายของร้านนี้ เพื่อตอบคำถามเรื่องราคาได้ตรง
              (สินค้าที่ปิดขายและสินค้าของร้านอื่นไม่ถูกส่งไป)
            </span>
          </span>
          <input
            type="checkbox"
            className="form-switch shrink-0"
            checked={isPaidPlan ? includeProductContext : false}
            onChange={(e) => setIncludeProductContext(e.target.checked)}
            disabled={!canEdit || saving || !isPaidPlan}
            aria-describedby={contextGateDescribedBy}
          />
        </label>

        <label className="border-default-200 flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={`block text-sm font-medium ${isPaidPlan ? 'text-default-800' : 'text-default-500'}`}>
                ให้ AI เห็นประวัติลูกค้า
              </span>
              {showUpgradeGate && (
                <Link
                  href="/business"
                  className={`badge ${subscriptionLapsed ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'}`}
                >
                  {subscriptionLapsed ? 'ต่ออายุแพ็กเกจ' : 'อัพเกรดแพ็กเกจ'}
                </Link>
              )}
            </span>
            <span className="text-default-500 block text-xs">
              AI จะเห็นออเดอร์ล่าสุดของลูกค้ารายนั้นกับร้านนี้ (สถานะ ยอด วันที่) เพื่อตอบคำถาม
              &ldquo;ของถึงไหนแล้ว&rdquo; ได้ — เบอร์โทร อีเมล และที่อยู่ที่เก็บในระบบไม่ถูกส่งไปไม่ว่ากรณีใด
            </span>
          </span>
          <input
            type="checkbox"
            className="form-switch shrink-0"
            checked={isPaidPlan ? includeCustomerContext : false}
            onChange={(e) => setIncludeCustomerContext(e.target.checked)}
            disabled={!canEdit || saving || !isPaidPlan}
            aria-describedby={contextGateDescribedBy}
          />
        </label>

        {/* feature 00019 ext (user 2026-07-24) — ให้ AI อ่านรูป/ฟังเสียง
            คำอธิบายต้องบอกผลด้าน PII ตรง ๆ: ต่างจากบริบทข้อความที่เรากรองเบอร์/ที่อยู่ออกก่อน
            ไฟล์จากลูกค้าถูกส่งทั้งไฟล์ ถ้าในรูปมีที่อยู่/เบอร์ AI ก็เห็น — ร้านต้องรู้ก่อนเปิด */}
        <label className="border-default-200 flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={`block text-sm font-medium ${isPaidPlan ? 'text-default-800' : 'text-default-500'}`}>
                ให้ AI อ่านรูปและฟังข้อความเสียง
              </span>
              {showUpgradeGate && (
                <Link
                  href="/business"
                  className={`badge ${subscriptionLapsed ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'}`}
                >
                  {subscriptionLapsed ? 'ต่ออายุแพ็กเกจ' : 'อัพเกรดแพ็กเกจ'}
                </Link>
              )}
            </span>
            <span className="text-default-500 block text-xs">
              AI จะเปิดดูรูป (สลิปโอนเงิน รูปสินค้า ที่อยู่จัดส่ง) และถอดข้อความเสียงที่ลูกค้าส่งมา
              เพื่อร่างคำตอบให้ตรงเรื่อง — ปิดไว้ AI จะเห็นแค่ว่า &ldquo;ลูกค้าส่งรูป/เสียงมา&rdquo;
            </span>
            <span className="text-warning mt-1 block text-xs">
              เปิดแล้วไฟล์จะถูกส่งเข้าระบบ AI ทั้งไฟล์ — ถ้าในรูปหรือเสียงมีเบอร์โทร/ที่อยู่ AI จะเห็นด้วย
            </span>
          </span>
          <input
            type="checkbox"
            className="form-switch shrink-0"
            checked={isPaidPlan ? includeMediaContext : false}
            onChange={(e) => setIncludeMediaContext(e.target.checked)}
            disabled={!canEdit || saving || !isPaidPlan}
            aria-describedby={contextGateDescribedBy}
          />
        </label>
      </div>

      {/* ── หมายเหตุความปลอดภัย: ต้องบอกให้ร้านรู้ว่าคำสั่งของร้านลบล้างกฎระบบไม่ได้ (AC-001-06) ── */}
      <div className="bg-light/40 text-default-600 rounded-lg p-3 text-xs">
        กฎความปลอดภัยของระบบมีผลเหนือคำสั่งประจำร้านเสมอ — AI จะไม่ขอรหัสผ่าน OTP หรือข้อมูลบัตรจากลูกค้า
        และจะไม่ระบุราคาหรือเงื่อนไขที่ไม่มีอยู่จริงในระบบ ไม่ว่าคำสั่งจะเขียนไว้อย่างไร
        ทุกข้อความยังต้องกดส่งเองเสมอ ระบบไม่ตอบลูกค้าอัตโนมัติ
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || overLimit}
            className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? (
              <>
                <Icon icon="loader-2" className="me-1 animate-spin text-base" />
                กำลังบันทึก...
              </>
            ) : (
              'บันทึกการตั้งค่า'
            )}
          </button>
        </div>
      )}
    </div>
  )
}
