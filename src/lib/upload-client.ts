/**
 * upload-client — ฝั่งเบราว์เซอร์ของ direct upload (2026-08-10)
 *
 * แทนที่แพตเทิร์นเดิมที่กระจายอยู่ 17 จุด (`new FormData()` → `fetch('/api/upload')`) ซึ่ง
 * ทุกจุดตันที่เพดาน request body 4.5MB ของ Vercel โดยไม่มีจุดไหนรู้ตัว — ที่มาแบบเต็มอยู่ใน
 * `src/lib/upload-policy.ts`
 *
 * 3 ขั้น: ขอ ticket → PUT เข้า storage ตรง → commit ให้ server ตรวจของจริงแล้วคืน metadata
 * ทุกขั้นคืน `Error` ที่ `message` เป็นภาษาไทยพร้อมโชว์ toast ได้ทันที (ผู้เรียกไม่ต้องแปลอะไรอีก)
 *
 * ใช้ XMLHttpRequest ตอน PUT ไม่ใช่ fetch เพราะ **fetch ไม่มี upload progress** — ไฟล์ 25MB
 * บนเน็ตมือถือใช้เวลาเป็นสิบวินาที ถ้าไม่มีเปอร์เซ็นต์ให้ดู ผู้ใช้จะสรุปว่าค้างแล้วกดใหม่
 * (ซึ่งเริ่มอัปโหลดซ้ำตั้งแต่ต้น = ยิ่งช้า)
 */

import type { AttachmentKind } from '@/lib/chat-attachment'
import type { UploadPurpose } from '@/lib/upload-policy'

export type UploadedFile = {
  fileId: string
  name: string
  size: number
  mime: string
  kind: AttachmentKind
}

export type UploadOptions = {
  purpose: UploadPurpose
  /** เฉพาะ purpose='CHAT' — server ใช้ตรวจกฎเฉพาะช่องทางของเธรดนั้น */
  conversationId?: string
  /** 0–100 — ค่าจาก event ของ XHR ตรง ๆ ไม่ปัดเพิ่ม */
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

type TicketResponse = {
  fileId: string
  url: string
  method: 'PUT'
  headers: Record<string, string>
  ticket: string
  maxSize: number
}

/** อ่านข้อความ error จาก response ของเราเอง — route ทุกตัวคืน `{ error }` ที่พร้อมโชว์ */
async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (data?.error) return data.error
  // 413 จากแพลตฟอร์ม (ไม่ใช่จาก route เรา) — body เป็น HTML/ข้อความ ไม่ใช่ JSON
  if (res.status === 413) return 'ไฟล์ใหญ่เกินที่เซิร์ฟเวอร์รับได้'
  return fallback
}

function putWithProgress(
  ticket: TicketResponse,
  file: File,
  opts: UploadOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(ticket.method, ticket.url, true)
    for (const [k, val] of Object.entries(ticket.headers)) xhr.setRequestHeader(k, val)

    const onAbort = () => xhr.abort()
    opts.signal?.addEventListener('abort', onAbort)
    const cleanup = () => opts.signal?.removeEventListener('abort', onAbort)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      // 413 = bucket ปฏิเสธเอง (file_size_limit) · 403 = ลายเซ็นหมดอายุ/ไม่ตรง
      if (xhr.status === 413) {
        return reject(new Error('ไฟล์ใหญ่เกินที่ระบบรับได้ — ย่อไฟล์แล้วลองใหม่'))
      }
      if (xhr.status === 403) {
        return reject(new Error('ใบอนุญาตอัปโหลดหมดอายุ กรุณาแนบไฟล์ใหม่อีกครั้ง'))
      }
      reject(new Error(`อัปโหลดไฟล์ไม่สำเร็จ (${xhr.status}) ลองใหม่อีกครั้ง`))
    }
    xhr.onerror = () => {
      cleanup()
      // ไม่มี status ให้อ่าน = เน็ตหลุด/ถูกบล็อกก่อนถึงปลายทาง — บอกให้เช็คสัญญาณ ไม่ใช่ "ลองใหม่" เปล่า ๆ
      reject(new Error('อัปโหลดไฟล์ไม่สำเร็จ — การเชื่อมต่อขาด กรุณาตรวจสัญญาณแล้วลองใหม่'))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    xhr.send(file)
  })
}

/**
 * อัปโหลดไฟล์เดียว — คืน metadata ที่ server ยืนยันแล้ว (ขนาดจาก HEAD ไม่ใช่จาก `file.size`)
 *
 * `size` ที่คืนมาจึงเชื่อได้ ต่างจากเดิมที่ทุก call site ส่ง `file.size` ของตัวเองต่อเข้า DB
 */
export async function uploadToStorage(file: File, opts: UploadOptions): Promise<UploadedFile> {
  const ticketRes = await fetch('/api/uploads/ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      purpose: opts.purpose,
      name: file.name,
      size: file.size,
      mime: file.type || '',
      conversationId: opts.conversationId,
    }),
    signal: opts.signal,
  })
  if (!ticketRes.ok) {
    throw new Error(await readError(ticketRes, 'เตรียมอัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง'))
  }
  const ticket = (await ticketRes.json()) as TicketResponse

  await putWithProgress(ticket, file, opts)

  const commitRes = await fetch('/api/uploads/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticket: ticket.ticket, name: file.name, mime: file.type || '' }),
    signal: opts.signal,
  })
  if (!commitRes.ok) {
    throw new Error(await readError(commitRes, 'อัปโหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง'))
  }
  return (await commitRes.json()) as UploadedFile
}

/**
 * ทางลัดสำหรับ call site เดิมที่ต้องการแค่ `fileId` (รูปสินค้า/อวาตาร์/สลิป/เอกสาร)
 * — มีไว้ให้ diff ของการย้ายเล็กที่สุด ไม่ต้องรื้อ state ของแต่ละหน้า
 */
export async function uploadFileId(
  file: File,
  purpose: UploadPurpose = 'IMAGE',
  opts?: Omit<UploadOptions, 'purpose'>,
): Promise<string> {
  const uploaded = await uploadToStorage(file, { ...opts, purpose })
  return uploaded.fileId
}
