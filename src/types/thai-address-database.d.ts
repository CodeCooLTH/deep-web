// ambient types สำหรับ thai-address-database (ไม่มี .d.ts มากับ package)
// ใช้ใน ThaiAddressSearch (dataset ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ของ earthchie)
declare module 'thai-address-database' {
  export interface ThaiAddressEntry {
    district: string
    amphoe: string
    province: string
    zipcode: string
  }
  export function searchAddressByDistrict(q: string): ThaiAddressEntry[]
  export function searchAddressByAmphoe(q: string): ThaiAddressEntry[]
  export function searchAddressByProvince(q: string): ThaiAddressEntry[]
  export function searchAddressByZipcode(q: string): ThaiAddressEntry[]
  export function splitAddress(fullAddress: string): ThaiAddressEntry | null
}
