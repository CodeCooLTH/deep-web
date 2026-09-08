/**
 * apple/root-ca — ใบรับรองรากของ Apple ที่เราปักหมุดไว้ (feature 00064)
 *
 * ทุกธุรกรรมที่ StoreKit เซ็นและทุกการแจ้งเตือนจาก App Store Server Notifications
 * แนบห่วงโซ่ใบรับรองมาใน header `x5c` — ความน่าเชื่อถือทั้งหมดของฟีเจอร์นี้ขึ้นกับ
 * **ห่วงโซ่นั้นสาวไปถึงใบนี้ได้จริงไหม**
 *
 * ── 🛑 ทำไมต้องปักหมุดใบราก ไม่ใช้ trust store ของระบบ ────────────────────────
 *
 * ถ้าเชื่อ trust store ของเครื่อง ใครก็ตามที่มีใบรับรองจาก CA ใดก็ได้ในโลก (ซึ่งมีเป็นร้อย)
 * จะเซ็น payload ปลอมแล้วผ่านด่านเรา = **แจกสิทธิ์ฟรีให้คนที่ไม่ได้จ่ายเงิน**
 * ธุรกรรมของ Apple ต้องมาจาก Apple เท่านั้น ⇒ ปักหมุดใบเดียว ไม่รับใบอื่น
 *
 * ── ที่มาของไฟล์นี้ ───────────────────────────────────────────────────────────
 *
 * ดาวน์โหลดจาก `https://www.apple.com/certificateauthority/AppleRootCA-G3.cer`
 * (2026-09-04) แล้วแปลง DER → PEM ด้วย `openssl x509 -inform DER`
 *
 * 🛑 **ห้ามพิมพ์ใบรับรองจากความจำหรือก็อปจากบล็อกใคร** — ผิดไปตัวเดียวคือ
 * ทุกธุรกรรมถูกปฏิเสธ (ดีบักยากมาก เพราะดูเหมือน "Apple ส่งของเสีย")
 * และถ้าเผลอเอาใบของคนอื่นมาใส่คือเปิดประตูให้เขาเซ็นสิทธิ์แจกเอง
 *
 * วิธีตรวจว่าใบนี้ยังใช่:
 *   openssl x509 -in <file> -noout -fingerprint -sha256
 *   → ต้องได้ตรงกับ APPLE_ROOT_CA_G3_SHA256 ข้างล่าง
 */

/** Apple Root CA - G3 · self-signed · หมดอายุ 2039-04-30 */
export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`

/**
 * ลายนิ้วมือ SHA-256 ของใบข้างบน — **ด่านชั้นที่สอง**
 *
 * ตรวจตอนรันว่า PEM ที่โหลดมาคือใบที่เราตั้งใจจริง ๆ — ถ้ามีใครแก้สตริงข้างบน
 * (ตั้งใจหรือ merge ผิด) ระบบจะดังทันทีแทนที่จะเชื่อใบใหม่เงียบ ๆ
 *
 * ค่านี้ตรงกับที่ Apple ประกาศไว้ในหน้า Certificate Authority ของเขาเอง
 */
export const APPLE_ROOT_CA_G3_SHA256 =
  '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179'
