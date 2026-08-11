import 'server-only'

/**
 * line-rich-menu.service — สร้าง/เปิด/ปิดเมนูลัดใน LINE (feature 00045)
 *
 * ทุกฟังก์ชัน scope `shopChannelId` ด้วย `shopId` ใน `WHERE` เสมอ (NFR-RM-4) — นอกขอบเขต = คืน null
 * แล้วให้ route ตอบ **404 ไม่ใช่ 403** (403 ยืนยันว่าทรัพยากรนั้นมีจริง — SRS §7.14)
 *
 * 🛑 ข้อจำกัดของ LINE ที่กำหนดรูปร่างไฟล์นี้ทั้งไฟล์ (ที่มาเต็ม: PRD §4.3):
 *   - เมนู **แก้ไขไม่ได้** ไม่มี endpoint แก้ และอัปโหลดรูปซ้ำลงใบเดิมไม่ได้ ⇒ "แก้ไข" = สร้างใหม่ทุกครั้ง
 *   - สร้างได้ **100 ครั้ง/ชั่วโมง** ⇒ ห้ามยิงสร้างตอนบันทึกร่าง ต้องยิงตอนกดเปิดใช้เท่านั้น
 *   - เมนูที่ร้านตั้งเองใน LINE OA Manager **มองไม่เห็นและแก้ไม่ได้จากฝั่ง API** ⇒ ด่านกันเขียนทับ
 *     เป็น "ความยินยอม" ไม่ใช่ "การตรวจสอบ"
 */

import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/token-crypto'
import { getFile } from '@/lib/storage'
import { fileIdExt } from '@/lib/storage'
import { lineApiRequest, lineDataApiUpload, LineApiError } from '@/lib/line/client'
import {
  buildRichMenuName,
  buildRichMenuPayload,
  isOwnRichMenuName,
  readImageSize,
  validateRichMenuImage,
  type RichMenuButton,
} from '@/lib/line/rich-menu'

/** สถานะที่หน้าจอแสดง (PRD §3.3) — derive สดเสมอ ไม่เก็บเป็นคอลัมน์ (TD-RM-2) */
export type RichMenuState = 'NONE' | 'DRAFT' | 'ACTIVE' | 'UNKNOWN'

export type RichMenuView = {
  state: RichMenuState
  /** true = อ่านสถานะจาก LINE ไม่สำเร็จ — จอต้องบอกว่าข้อมูลอาจไม่ตรงปัจจุบัน ห้ามเดาว่า ACTIVE */
  stateStale: boolean
  templateKey: string | null
  chatBarText: string | null
  buttons: RichMenuButton[]
  imageFileId: string | null
  consentAt: Date | null
  canActivate: boolean
}

/** ข้อผิดพลาดเชิงธุรกิจของฟีเจอร์นี้ — route แปลงเป็น HTTP ตาม API.md §5 */
export class RichMenuError extends Error {
  constructor(
    readonly code:
      | 'CHANNEL_NOT_FOUND'
      | 'NOT_LINE_CHANNEL'
      | 'CONSENT_REQUIRED'
      | 'DRAFT_INCOMPLETE'
      | 'IMAGE_REJECTED'
      | 'TOKEN_INVALID'
      | 'RATE_LIMITED'
      | 'UPSTREAM_ERROR',
    message: string,
    /** เหตุผลรายข้อของภาพที่ไม่ผ่าน — ให้จอแสดงเป็นข้อ ๆ ไม่ใช่ก้อนเดียว */
    readonly reasons?: string[],
  ) {
    super(message)
    this.name = 'RichMenuError'
  }
}

/** แปลง error ของ LINE เป็น error เชิงธุรกิจ — 🛑 ต้องแยก "กดซ้ำมีผล" ออกจาก "กดซ้ำไม่มีทางสำเร็จ"
 *  ให้ถูก ไม่งั้นจอจะเชิญให้ผู้ใช้กดวนสิ่งที่ไม่มีวันผ่าน (บทเรียน iShip 2026-08-06) */
function mapLineError(e: unknown): RichMenuError {
  if (e instanceof LineApiError) {
    if (e.kind === 'TOKEN_INVALID') {
      return new RichMenuError('TOKEN_INVALID', 'โทเคนของเพจนี้ใช้ไม่ได้แล้ว กรุณาเชื่อมเพจใหม่อีกครั้ง')
    }
    if (e.status === 429) {
      return new RichMenuError('RATE_LIMITED', 'LINE จำกัดจำนวนครั้งที่สร้างเมนูต่อชั่วโมง กรุณาลองใหม่ในอีกสักครู่')
    }
    return new RichMenuError('UPSTREAM_ERROR', `ระบบของ LINE ขัดข้อง: ${e.message}`)
  }
  return new RichMenuError('UPSTREAM_ERROR', 'ระบบของ LINE ขัดข้อง กรุณาลองใหม่อีกครั้ง')
}

/** หาเพจ + เมนูของเพจนั้น โดย scope ด้วย shopId ใน WHERE (ไม่ดึงมาแล้วค่อยเทียบทีหลัง) */
async function loadChannel(shopId: string, shopChannelId: string) {
  const channel = await prisma.shopChannel.findFirst({
    where: { id: shopChannelId, shopId },
    select: { id: true, provider: true, accessTokenEnc: true, status: true, richMenu: true },
  })
  if (!channel) throw new RichMenuError('CHANNEL_NOT_FOUND', 'ไม่พบเพจนี้')
  if (channel.provider !== 'LINE') {
    throw new RichMenuError('NOT_LINE_CHANNEL', 'เมนูลัดใช้ได้เฉพาะเพจ LINE')
  }
  return channel
}

/** อ่าน id ของเมนูที่ตั้งเป็น default ผ่าน API — 404 = ไม่ได้ตั้งไว้ (ไม่ใช่ error) */
async function readDefaultRichMenuId(token: string): Promise<{ id: string | null; stale: boolean }> {
  try {
    const json = await lineApiRequest('/v2/bot/user/all/richmenu', token)
    return { id: typeof json.richMenuId === 'string' ? json.richMenuId : null, stale: false }
  } catch (e) {
    // 404 = ยังไม่ได้ตั้ง default ผ่าน API — เป็นสถานะปกติ ไม่ใช่ความผิดพลาด
    if (e instanceof LineApiError && e.status === 404) return { id: null, stale: false }
    // อ่านไม่ได้จริง ๆ — 🛑 ห้ามเดาว่า ACTIVE เพราะนี่คือข้อมูลที่ผู้ขายใช้ตัดสินใจว่าลูกค้าเห็นอะไรอยู่
    return { id: null, stale: true }
  }
}

export async function getRichMenuState(shopId: string, shopChannelId: string): Promise<RichMenuView> {
  const channel = await loadChannel(shopId, shopChannelId)
  const row = channel.richMenu

  const base = {
    templateKey: row?.templateKey ?? null,
    chatBarText: row?.chatBarText ?? null,
    buttons: (row?.buttons as RichMenuButton[] | undefined) ?? [],
    imageFileId: row?.imageFileId ?? null,
    consentAt: row?.consentAt ?? null,
    canActivate: Boolean(row?.consentAt && row?.imageFileId && row?.templateKey),
  }

  if (!row) return { ...base, state: 'NONE', stateStale: false }
  if (!row.lineRichMenuId) return { ...base, state: 'DRAFT', stateStale: false }

  const token = decryptToken(channel.accessTokenEnc)
  const current = await readDefaultRichMenuId(token)
  if (current.stale) return { ...base, state: 'UNKNOWN', stateStale: true }

  // 🛑 `UNKNOWN` ไม่ได้แปลว่า "ร้านนี้ไม่มีเมนู" — แปลว่าเราไม่ได้ตั้ง default ไว้ ลูกค้าอาจเห็นเมนู
  // ที่ร้านตั้งเองใน LINE OA Manager ซึ่งฝั่ง API มองไม่เห็นเลย (FR-RM-06 — คำบนจอห้ามโกหกข้อนี้)
  return {
    ...base,
    state: current.id && current.id === row.lineRichMenuId ? 'ACTIVE' : 'UNKNOWN',
    stateStale: false,
  }
}

export async function saveDraft(params: {
  shopId: string
  shopChannelId: string
  actorUserId: string
  templateKey: string
  chatBarText: string
  buttons: RichMenuButton[]
  imageFileId: string | null
}): Promise<void> {
  await loadChannel(params.shopId, params.shopChannelId)
  // 🛑 ไม่ยิง LINE ที่นี่โดยเด็ดขาด — เพดานสร้างเมนู 100 ครั้ง/ชั่วโมง ร้านที่แก้คำไปมาจะเผาเพดาน
  // หมดโดยไม่ได้อะไร (การสร้างจริงเกิดตอน activate เท่านั้น)
  await prisma.lineRichMenu.upsert({
    where: { shopChannelId: params.shopChannelId },
    create: {
      shopChannelId: params.shopChannelId,
      templateKey: params.templateKey,
      chatBarText: params.chatBarText,
      buttons: params.buttons as never,
      imageFileId: params.imageFileId,
      createdByUserId: params.actorUserId,
    },
    update: {
      templateKey: params.templateKey,
      chatBarText: params.chatBarText,
      buttons: params.buttons as never,
      imageFileId: params.imageFileId,
    },
  })
}

export async function recordConsent(params: {
  shopId: string
  shopChannelId: string
  actorUserId: string
}): Promise<Date> {
  const channel = await loadChannel(params.shopId, params.shopChannelId)
  if (!channel.richMenu) throw new RichMenuError('DRAFT_INCOMPLETE', 'ยังไม่มีเมนูให้เปิดใช้')
  // ยินยอมแล้วไม่ต้องบันทึกซ้ำ — เก็บ "ครั้งแรก" ไว้เป็นหลักฐานว่าใครตัดสินใจเมื่อไร
  if (channel.richMenu.consentAt) return channel.richMenu.consentAt
  const now = new Date()
  await prisma.lineRichMenu.update({
    where: { shopChannelId: params.shopChannelId },
    data: { consentAt: now, consentByUserId: params.actorUserId },
  })
  return now
}

/**
 * เปิดใช้เมนู — ลำดับ 6 ขั้นตาม SRS TFR-RM-03 (ห้ามสลับ)
 *
 * 🛑 ขั้น 6 (เก็บกวาด) ล้ม **ห้ามทำให้ทั้ง request ล้ม** — เมนูใหม่ทำงานแล้ว การเก็บกวาดไม่สำเร็จ
 * เป็นเรื่องรองที่รอบหน้าเก็บต่อได้ ส่วนขั้น 2–5 ล้มที่ขั้นไหนก็ตาม ต้องไม่บันทึกว่าเปิดใช้แล้ว
 */
export async function activate(params: {
  shopId: string
  shopChannelId: string
}): Promise<{ lineRichMenuId: string }> {
  const channel = await loadChannel(params.shopId, params.shopChannelId)
  const row = channel.richMenu
  if (!row) throw new RichMenuError('DRAFT_INCOMPLETE', 'ยังไม่มีเมนูให้เปิดใช้')

  // ---- ขั้น 1: ด่านความยินยอม (BR-RM-01) ----
  // 🛑 ต้องอยู่ที่ server ไม่ใช่แค่ที่จอ — ไม่งั้นการยิง API ตรงจะข้ามด่านนี้ได้ทั้งด่าน
  if (!row.consentAt) {
    throw new RichMenuError('CONSENT_REQUIRED', 'ต้องยืนยันก่อนว่าให้เมนูของ Deep แสดงแทนเมนูเดิมของเพจนี้')
  }
  if (!row.imageFileId || !row.templateKey) {
    throw new RichMenuError('DRAFT_INCOMPLETE', 'ยังสร้างภาพเมนูไม่เสร็จ')
  }

  const file = await getFile(row.imageFileId)
  if (!file) throw new RichMenuError('DRAFT_INCOMPLETE', 'ไม่พบไฟล์ภาพเมนู กรุณาสร้างภาพใหม่')

  // 🛑 ตรวจภาพที่ **server** ก่อนยิง LINE เสมอ — ค่าที่ client ส่งมาไม่ใช่ด่าน (NFR-RM-2)
  // ขนาดจริงอ่านจากไฟล์ ไม่ใช่จากตัวเลขที่ฝั่งหน้าจอแจ้งมา
  const ext = fileIdExt(row.imageFileId).toLowerCase()
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
  const dim = readImageSize(file.buffer, mime)
  const check = validateRichMenuImage({
    bytes: file.buffer.byteLength,
    width: dim?.width ?? 0,
    height: dim?.height ?? 0,
    mime,
  })
  if (!check.ok) {
    throw new RichMenuError('IMAGE_REJECTED', 'ภาพเมนูไม่ผ่านเกณฑ์ของ LINE', check.reasons)
  }

  const token = decryptToken(channel.accessTokenEnc)
  const name = buildRichMenuName(params.shopChannelId, Date.now())
  const payload = buildRichMenuPayload({
    name,
    chatBarText: row.chatBarText,
    buttons: row.buttons as unknown as RichMenuButton[],
  })

  let newId: string
  try {
    // ---- ขั้น 2: สร้างเมนู ----
    const created = await lineApiRequest('/v2/bot/richmenu', token, { method: 'POST', body: payload })
    newId = String(created.richMenuId ?? '')
    if (!newId) throw new RichMenuError('UPSTREAM_ERROR', 'LINE ไม่ได้คืนรหัสเมนูกลับมา')

    // ---- ขั้น 3: อัปโหลดภาพ (คนละโฮสต์กับขั้นอื่น) ----
    await lineDataApiUpload(`/v2/bot/richmenu/${newId}/content`, token, file.buffer, mime)

    // ---- ขั้น 4: ตั้งเป็นเมนูเริ่มต้นของทุกคน ----
    await lineApiRequest(`/v2/bot/user/all/richmenu/${newId}`, token, { method: 'POST' })
  } catch (e) {
    if (e instanceof RichMenuError) throw e
    // ล้มที่ขั้นไหนก็ตาม → ไม่บันทึกว่าเปิดใช้แล้ว. ใบที่ค้างบน LINE (ถ้าขั้น 2 ผ่านไปแล้ว) จะถูก
    // เก็บกวาดในรอบถัดไปเอง เพราะชื่อขึ้นต้นด้วย prefix เดียวกัน — นี่คือเหตุผลที่ชื่อเมนูมี prefix
    throw mapLineError(e)
  }

  // ---- ขั้น 5: บันทึก ----
  // 🛑 ยิง LINE สำเร็จแล้วเขียน DB ล้ม = จอกับความจริงต่างกัน — แต่ **กู้ได้เอง** เพราะสถานะบนจอ
  // derive จาก `GET /v2/bot/user/all/richmenu` ไม่ใช่จากคอลัมน์ที่เพิ่งเขียนไม่สำเร็จ (NFR-RM-3)
  await prisma.lineRichMenu.update({
    where: { shopChannelId: params.shopChannelId },
    data: { lineRichMenuId: newId },
  })

  // ---- ขั้น 6: เก็บกวาดใบเก่าของเพจนี้ (best-effort) ----
  await cleanupOwnMenus(token, params.shopChannelId, newId).catch((e) => {
    console.error('[rich-menu] เก็บกวาดเมนูเก่าไม่สำเร็จ (ไม่กระทบเมนูที่เพิ่งเปิดใช้)', e)
  })

  return { lineRichMenuId: newId }
}

/**
 * ลบเมนูของเพจนี้ที่ไม่ใช่ใบปัจจุบัน
 *
 * 🛑 ตัดสินจาก **prefix ของชื่อ** เท่านั้น — เมนูของเพจอื่นหรือของ LINE OA Manager ต้องไม่ถูกแตะ
 * (เมนูจาก OA Manager ไม่โผล่ใน list อยู่แล้ว แต่กันไว้อีกชั้นเพราะการลบผิดใบกู้คืนไม่ได้)
 */
async function cleanupOwnMenus(token: string, shopChannelId: string, keepId: string): Promise<void> {
  const json = await lineApiRequest('/v2/bot/richmenu/list', token)
  const list = Array.isArray(json.richmenus) ? (json.richmenus as { richMenuId?: string; name?: string }[]) : []
  for (const m of list) {
    if (!m.richMenuId || m.richMenuId === keepId) continue
    if (!isOwnRichMenuName(m.name, shopChannelId)) continue
    await lineApiRequest(`/v2/bot/richmenu/${m.richMenuId}`, token, { method: 'DELETE' }).catch((e) => {
      console.error('[rich-menu] ลบเมนูเก่าไม่สำเร็จ', m.richMenuId, e)
    })
  }
}

/**
 * คืนเมนูเดิม — ยกเลิก default ที่ตั้งผ่าน API แล้วเมนูที่ร้านตั้งใน OA Manager จะกลับมาแสดงเอง
 *
 * 🛑 **ไม่ลบตัวเมนู** — ร้านต้องเปิดกลับได้โดยไม่ต้องสร้างใหม่ (FR-RM-05)
 */
export async function deactivate(params: { shopId: string; shopChannelId: string }): Promise<void> {
  const channel = await loadChannel(params.shopId, params.shopChannelId)
  const token = decryptToken(channel.accessTokenEnc)
  try {
    await lineApiRequest('/v2/bot/user/all/richmenu', token, { method: 'DELETE' })
  } catch (e) {
    // ไม่มี default อยู่แล้ว (404) = ผลลัพธ์ที่ต้องการอยู่แล้ว ไม่ใช่ความผิดพลาด
    if (e instanceof LineApiError && e.status === 404) return
    throw mapLineError(e)
  }
}
