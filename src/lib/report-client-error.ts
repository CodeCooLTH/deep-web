// ส่งรายละเอียด error ฝั่งเบราว์เซอร์กลับมาเขียนลง Vercel log (2026-09-21)
//
// ทำไมต้องมี: error ที่พังในเครื่องลูกค้าไม่เคยไปถึง server เลย — จอขาว "Application error"
// บน prod ไม่มีร่องรอยให้สืบสักบรรทัด ต้องเดาจาก log ของ API รอบข้างเอา
// ใช้ sendBeacon เพราะผู้ใช้มักกด "กลับ"/"ลองใหม่" ทันที fetch ปกติจะถูกยกเลิกกลางทาง
export function reportClientError(error: unknown, where: string): void {
  try {
    const e = error as { message?: unknown; stack?: unknown; digest?: unknown; name?: unknown }
    const body = JSON.stringify({
      where,
      name: typeof e?.name === 'string' ? e.name : undefined,
      message: typeof e?.message === 'string' ? e.message : String(error),
      stack: typeof e?.stack === 'string' ? e.stack : undefined,
      digest: typeof e?.digest === 'string' ? e.digest : undefined,
      url: window.location.href,
    })
    const blob = new Blob([body], { type: 'application/json' })
    if (!navigator.sendBeacon?.('/api/client-error', blob)) {
      void fetch('/api/client-error', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } })
    }
  } catch {
    // รายงานไม่ได้ก็ไม่เป็นไร — ห้ามให้ตัวรายงานพังซ้อนบนหน้า error
  }
}
