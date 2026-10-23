// feature 00022 — สิ่งที่เกิดขึ้นกับพัสดุ "หลังสร้างคำสั่งซื้อสำเร็จ" (FR-ISHIP-020/021)
//
// client-safe: ไม่ import prisma/service — เรียกผ่าน API เท่านั้น
//
// 00084 T10b: ร้านที่เชื่อม Flash (บัญชีของร้านเอง) ด้วย → decideAfterCreate (lib/shipping/after-create.ts)
// ตัดสินว่าเปิดกับใคร · ร้าน iShip อย่างเดียวเดินเส้นทางเดิมทุกตัวอักษร
//
// ข้อควรระวังที่เป็นหัวใจของไฟล์นี้ (BR-ISHIP-21):
// ฟังก์ชันนี้ถูกเรียก "หลัง" คำสั่งซื้อถูกบันทึกสำเร็จแล้วเสมอ และต้องไม่โยน error
// ออกไปไม่ว่ากรณีใด — ความล้มเหลวของระบบขนส่งภายนอกห้ามทำให้ร้านรู้สึกว่าออเดอร์พัง
//
// ทำไมยิงจากฝั่งเบราว์เซอร์ ไม่ใช่งานเบื้องหลังฝั่งเซิร์ฟเวอร์:
// ระบบรันบน Vercel ที่ไม่มีเซิร์ฟเวอร์ประจำ — งานที่ค้างไว้หลังตอบ response
// ไม่รับประกันว่าจะได้รัน ถ้าทำแบบนั้นจะมีออเดอร์ที่ "ควรมีพัสดุแต่ไม่มี" แบบเงียบ ๆ
// การยิงจากหน้าเว็บทำให้ผลลัพธ์อยู่ในสายตาร้านเสมอ และแยกความล้มเหลวออกจากการสร้างออเดอร์

import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import { shipmentApiBase, type ShipmentProvider } from '@/lib/shipping/provider'
import {
  AFTER_CREATE_FALLBACK_ERROR,
  ASK_CANCEL_TEXT,
  ASK_CONFIRM_TEXT,
  CHOOSE_FOOTNOTE,
  CHOOSE_OPTIONS,
  CHOOSE_REQUIRED,
  CHOOSE_TITLE,
  FLASH_ASK_TITLE,
  FLASH_ASK_WARNING,
  ISHIP_ASK_HTML,
  ISHIP_ASK_TITLE,
  decideAfterCreate,
  escapeHtml,
  flashAskRows,
  shipmentOutcomeToast,
  type AfterCreateProviders,
  type FlashAskFacts,
} from '@/lib/shipping/after-create'
import type { FlashPanelJson } from '@/services/flash.service'

export type IShipCreateMode = 'AUTO' | 'ASK' | 'OFF'

const SWAL_BUTTONS = {
  buttonsStyling: false,
  customClass: {
    confirmButton: 'btn bg-primary text-white hover:bg-primary-hover',
    cancelButton: 'btn border-default-300 ms-2',
  },
} as const

const withShop = (path: string, shopId?: string | null) =>
  shopId ? `${path}${path.includes('?') ? '&' : '?'}shopId=${encodeURIComponent(shopId)}` : path

async function postShipment(
  orderId: string,
  shopId?: string | null,
  provider: ShipmentProvider = 'ISHIP',
): Promise<void> {
  // shopId = ร้านของออเดอร์ที่เพิ่งสร้าง (feature 00037) — ไม่ใช่ร้านที่ active เสมอไป
  // เมื่อคีย์จากเธรดของอีกร้าน. ไม่ส่ง = ร้านที่ active (พฤติกรรมเดิมของหน้า POS เต็มจอ)
  const res = await fetch(`${shipmentApiBase(provider)}/shipments${shopId ? `?shopId=${encodeURIComponent(shopId)}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
    cache: 'no-store',
  })

  if (!res.ok) {
    let message = 'สร้างพัสดุไม่สำเร็จ — เปิดพัสดุอีกครั้งได้จากหน้าคำสั่งซื้อ'
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch {
      // ปล่อยข้อความ default
    }
    pacesToast.error(message)
    return
  }

  const t = shipmentOutcomeToast((await res.json()) as Parameters<typeof shipmentOutcomeToast>[0])
  pacesToast[t.type](t.message)
}

/**
 * สรุปให้ Swal ถามของ Flash — ดึงไม่ได้/ช้า = คืนเท่าที่ได้ (หรือ null) ห้ามบล็อกขั้นตอนหลังสร้างออเดอร์ (BR-ISHIP-21)
 */
async function loadFlashFacts(orderId: string, shopId?: string | null): Promise<FlashAskFacts | null> {
  try {
    const res = await fetch(withShop(`/api/seller/flash/order-context?orderId=${encodeURIComponent(orderId)}`, shopId), {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const ctx = (await res.json()) as FlashPanelJson
    if (ctx.flashState !== 'READY') return null
    const r = ctx.receiver
    const weightKg = ctx.defaults.weight ?? null
    const facts: FlashAskFacts = {
      receiverName: r.name,
      phone: r.phone,
      subdistrict: r.subdistrict,
      district: r.district,
      province: r.province,
      postcode: r.postcode,
      weightKg,
      cod: ctx.codSuggested,
      quote: null,
    }
    if (weightKg && r.district && r.province && r.postcode) {
      try {
        const pr = await fetch(withShop('/api/seller/flash/price', shopId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiver: {
              district: r.district,
              province: r.province,
              postcode: r.postcode,
              ...(r.subdistrict ? { subdistrict: r.subdistrict } : {}),
            },
            weight: weightKg,
            ...(ctx.defaults.width ? { width: ctx.defaults.width } : {}),
            ...(ctx.defaults.length ? { length: ctx.defaults.length } : {}),
            ...(ctx.defaults.height ? { height: ctx.defaults.height } : {}),
          }),
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        })
        if (pr.ok) facts.quote = (await pr.json()) as { totalBaht: number; pricingTable: string }
      } catch {
        // ประเมินราคาไม่ได้ = แถวราคาบอกตรง ๆ ใน flashAskRows
      }
    }
    return facts
  } catch {
    return null
  }
}

/** Swal "สร้างพัสดุที่ Flash ด้วยไหม" — true = ร้านกดสร้าง */
async function askFlash(orderId: string, shopId?: string | null): Promise<boolean> {
  // Swal สั้น ๆ ระหว่างเตรียมสรุป — ถูกแทนที่ด้วยกล่องถามทันทีที่ได้ข้อมูล (หรือหมดเวลา)
  void Swal.fire({
    title: 'กำลังเตรียมข้อมูล',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  })
  const facts = await loadFlashFacts(orderId, shopId)
  const rows = facts
    ? flashAskRows(facts)
        .map(
          (r) =>
            `<div class="flex gap-2 py-0.5"><span class="text-default-700 w-28 shrink-0">${escapeHtml(r.label)}</span>` +
            `<span class="min-w-0 break-words">${escapeHtml(r.value)}</span></div>`,
        )
        .join('')
    : ''
  const result = await Swal.fire({
    title: FLASH_ASK_TITLE,
    html: `${rows ? `<div class="mb-3 text-start text-sm">${rows}</div>` : ''}<span class="text-danger">${FLASH_ASK_WARNING}</span>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: ASK_CONFIRM_TEXT,
    cancelButtonText: ASK_CANCEL_TEXT,
    ...SWAL_BUTTONS,
  })
  return result.isConfirmed
}

/** Swal เลือกผู้ให้บริการ (สองเจ้า) — ไม่เลือกค่าเริ่มต้นให้ (DD-5) */
async function chooseProvider(): Promise<ShipmentProvider | null> {
  const result = await Swal.fire({
    title: CHOOSE_TITLE,
    html: CHOOSE_FOOTNOTE,
    icon: 'question',
    input: 'radio',
    inputOptions: CHOOSE_OPTIONS,
    inputValidator: (v) => (v ? undefined : CHOOSE_REQUIRED),
    showCancelButton: true,
    confirmButtonText: ASK_CONFIRM_TEXT,
    cancelButtonText: ASK_CANCEL_TEXT,
    ...SWAL_BUTTONS,
  })
  return result.isConfirmed && (result.value === 'FLASH' || result.value === 'ISHIP') ? result.value : null
}

/**
 * runAfterOrderCreate — ตัดสินตามโหมดของร้านว่าจะเปิดพัสดุหรือไม่
 *
 * เรียกได้เสมอโดยไม่ต้องเช็คเงื่อนไขก่อน — ฟังก์ชันนี้ออกจากงานเองเมื่อไม่เข้าเงื่อนไข
 * ออเดอร์ที่ไม่เกี่ยวกับการส่งของถูกคัดออกที่ฝั่งเซิร์ฟเวอร์อีกชั้น (ตอบ 403 NOT_ELIGIBLE)
 * ซึ่งเรากลืนเป็นข้อความธรรมดา ไม่ใช่ปล่อยให้เด้งเป็น error ที่ทำให้ร้านตกใจ
 *
 * arg: โหมด iShip เดี่ยว (ผู้เรียกเดิม) หรือ { iship, flash } ของร้านที่เชื่อมได้สองเจ้า
 */
export async function runAfterOrderCreate(
  arg: IShipCreateMode | AfterCreateProviders,
  orderId: string | null,
  shopId?: string | null,
): Promise<void> {
  const decision = decideAfterCreate(typeof arg === 'string' ? { iship: arg, flash: 'OFF' } : arg)
  if (decision.kind === 'NONE' || !orderId) return

  try {
    if (decision.kind === 'CHOOSE') {
      const picked = await chooseProvider()
      // เลือกแล้ว = ยืนยันเลย ไม่ถามซ้ำแม้ตั้ง ASK (Design-Spec §5.3)
      if (picked) await postShipment(orderId, shopId, picked)
      return
    }

    if (decision.kind === 'FLASH') {
      if (decision.mode === 'ASK' && !(await askFlash(orderId, shopId))) return
      await postShipment(orderId, shopId, 'FLASH')
      return
    }

    if (decision.mode === 'AUTO') {
      await postShipment(orderId, shopId)
      return
    }

    // ASK — ค่าเริ่มต้นของระบบ: ถามก่อนเสมอ เพราะการเปิดพัสดุคือค่าใช้จ่ายจริงของร้าน
    const result = await Swal.fire({
      title: ISHIP_ASK_TITLE,
      html: ISHIP_ASK_HTML,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: ASK_CONFIRM_TEXT,
      cancelButtonText: ASK_CANCEL_TEXT,
      ...SWAL_BUTTONS,
    })
    if (!result.isConfirmed) return

    await postShipment(orderId, shopId)
  } catch {
    // กลืนทุก error โดยเจตนา — คำสั่งซื้อถูกบันทึกไปแล้ว ห้ามให้ขั้นตอนนี้ทำให้
    // ร้านเข้าใจว่าการสร้างออเดอร์ล้มเหลว (BR-ISHIP-21)
    pacesToast.error(AFTER_CREATE_FALLBACK_ERROR)
  }
}
