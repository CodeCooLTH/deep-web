/**
 * ธงระดับ session ว่า "เปิดโซนผู้ขายแล้ว" — ถ้ามีธง จอโลโก้ Deep (`seller/loading.tsx`) จะซ่อนตัวเอง
 *
 * แยกมาไว้ที่นี่เพราะมีคนเขียนสองที่: จอโลโก้เอง (ตอนขึ้นครั้งแรก) และ `useShopSwitcher`
 * (ก่อน hard-navigate — ดูเหตุผลที่นั่น) · คีย์ต้องตรงกันทุกตัวอักษร
 */
export const SELLER_BOOTED_KEY = 'deep_seller_booted'
