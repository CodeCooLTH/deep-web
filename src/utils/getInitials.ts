// Base: theme/vuexy/typescript-version/full-version/src/utils/getInitials.ts (copy ตรง — ไม่มี logic ปรับ)
// ใช้ทำ initials avatar fallback บน AuctionBidHistory (feature 00004 buyer web auction)
export const getInitials = (string: string) =>
  string.split(/\s/).reduce((response, word) => (response += word.slice(0, 1)), '')
