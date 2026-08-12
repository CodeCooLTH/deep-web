// feature 00022 — สิ่งที่เกิดขึ้นกับพัสดุ "หลังสร้างคำสั่งซื้อสำเร็จ" (FR-ISHIP-020/021)
//
// client-safe: ไม่ import prisma/service — เรียกผ่าน API เท่านั้น
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

export type IShipCreateMode = 'AUTO' | 'ASK' | 'OFF'

interface ShipmentResponse {
  status?: string
  trackingNo?: string | null
  lastErrorMessage?: string | null
}

async function postShipment(orderId: string, shopId?: string | null): Promise<void> {
  // shopId = ร้านของออเดอร์ที่เพิ่งสร้าง (feature 00037) — ไม่ใช่ร้านที่ active เสมอไป
  // เมื่อคีย์จากเธรดของอีกร้าน. ไม่ส่ง = ร้านที่ active (พฤติกรรมเดิมของหน้า POS เต็มจอ)
  const res = await fetch(`/api/seller/iship/shipments${shopId ? `?shopId=${encodeURIComponent(shopId)}` : ''}`, {
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

  const body = (await res.json()) as ShipmentResponse
  if (body.status === 'CREATED') {
    pacesToast.success(
      body.trackingNo ? `สร้างพัสดุแล้ว เลขติดตาม ${body.trackingNo}` : 'สร้างพัสดุแล้ว',
    )
  } else {
    pacesToast.error(
      body.lastErrorMessage ?? 'สร้างพัสดุไม่สำเร็จ — กดลองใหม่ได้จากหน้าคำสั่งซื้อ',
    )
  }
}

/**
 * runAfterOrderCreate — ตัดสินตามโหมดของร้านว่าจะเปิดพัสดุหรือไม่
 *
 * เรียกได้เสมอโดยไม่ต้องเช็คเงื่อนไขก่อน — ฟังก์ชันนี้ออกจากงานเองเมื่อไม่เข้าเงื่อนไข
 * ออเดอร์ที่ไม่เกี่ยวกับการส่งของถูกคัดออกที่ฝั่งเซิร์ฟเวอร์อีกชั้น (ตอบ 403 NOT_ELIGIBLE)
 * ซึ่งเรากลืนเป็นข้อความธรรมดา ไม่ใช่ปล่อยให้เด้งเป็น error ที่ทำให้ร้านตกใจ
 */
export async function runAfterOrderCreate(
  mode: IShipCreateMode,
  orderId: string | null,
  shopId?: string | null,
): Promise<void> {
  if (mode === 'OFF' || !orderId) return

  try {
    if (mode === 'AUTO') {
      await postShipment(orderId, shopId)
      return
    }

    // ASK — ค่าเริ่มต้นของระบบ: ถามก่อนเสมอ เพราะการเปิดพัสดุคือค่าใช้จ่ายจริงของร้าน
    const result = await Swal.fire({
      title: 'สร้างพัสดุที่ iShip ด้วยไหม',
      html:
        'ระบบจะเปิดพัสดุกับขนส่งตามค่าที่ตั้งไว้ในหน้าตั้งค่าการจัดส่ง<br/>' +
        '<span class="text-danger">มีค่าใช้จ่ายจริงกับบัญชี iShip ของร้าน</span>',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'สร้างพัสดุ',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover',
        cancelButton: 'btn border-default-300 ms-2',
      },
    })
    if (!result.isConfirmed) return

    await postShipment(orderId, shopId)
  } catch {
    // กลืนทุก error โดยเจตนา — คำสั่งซื้อถูกบันทึกไปแล้ว ห้ามให้ขั้นตอนนี้ทำให้
    // ร้านเข้าใจว่าการสร้างออเดอร์ล้มเหลว (BR-ISHIP-21)
    pacesToast.error('ยังสร้างพัสดุไม่ได้ — เปิดพัสดุอีกครั้งได้จากหน้าคำสั่งซื้อ')
  }
}
