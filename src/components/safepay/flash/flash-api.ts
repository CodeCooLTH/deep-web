// feature 00084 T10a — ตัวอ่าน error ของ /api/seller/flash/** (รูป {"error":{"code","message"}} ตาม API.md §1)

export interface ApiErrorInfo {
  code: string | null
  message: string
}

export async function readApiError(res: Response, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่'): Promise<ApiErrorInfo> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    return { code: body.error?.code ?? null, message: body.error?.message ?? fallback }
  } catch {
    return { code: null, message: fallback }
  }
}

/** ลิงก์ไปหน้าตั้งค่า Flash — query ที่ FlashSettingsRow อ่านเพื่อเปิดโมดัลที่แท็บนั้น */
export const FLASH_SENDER_SETTINGS_HREF = '/settings?flash=settings&tab=sender'
export const FLASH_SETTINGS_HREF = '/settings'
