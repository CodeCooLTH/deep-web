/**
 * escapeHtml — escape ตัวอักษร HTML พิเศษ ก่อน interpolate ข้อมูลผู้ใช้ (เช่น shopName)
 * เข้า SweetAlert2 `html:` (render ผ่าน innerHTML) — กัน XSS จากชื่อร้านที่มี markup
 * (เช่น `<img src=x onerror=...>`). ใช้ร่วมทุกจุดที่ต้องแปะ user-content เข้า Swal html.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
