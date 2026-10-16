// id แบบ UUID (route validate uuid) ที่ขึ้นต้น 77770000- — ใช้ร่วม seed/cleanup/e2e
export const CID = (k: string) => '77770000-0000-4000-8000-' + Buffer.from(k.padEnd(6, '_')).toString('hex')
