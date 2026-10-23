// helper fetch ของโมดัล Flash — อ่าน error ตามสัญญา API.md §1: { error: { code, message } }

export interface FlashApiError {
  code?: string
  message?: string
}

export async function readFlashError(res: Response): Promise<FlashApiError> {
  try {
    const body = (await res.json()) as { error?: FlashApiError }
    return body.error ?? {}
  } catch {
    return {}
  }
}

/** ยิง JSON ไปที่ /api/seller/flash/* — ร้านที่ active (หน้า /settings ไม่มี shop provider เหมือนแถว iShip) */
export function flashFetch(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown) {
  return fetch(`/api/seller/flash${path}`, {
    method,
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
}
