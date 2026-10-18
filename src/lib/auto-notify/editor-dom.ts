// feature 00078 T18 — DOM ของตัวแก้ (contenteditable) → ข้อความ `{ชื่อ}` · ไม่พึ่ง DOM จริง (รับ NodeLike) จึงเทสใน node ได้
// โครงที่ตัวแก้สร้างเอง: text node · <br> = '\n' · <span data-var="ชื่อ" contenteditable="false"> = `{ชื่อ}`
// โครงที่เบราว์เซอร์อาจสร้างเอง (Enter บางเครื่อง/IME): <div>/<p> = ขึ้นบรรทัดใหม่ · <br> ท้ายสุด = ที่วางเคอร์เซอร์ ไม่ใช่ '\n' จริง

export interface NodeLike {
  nodeType: number
  nodeName: string
  textContent: string | null
  childNodes: ArrayLike<NodeLike>
  getAttribute?: (name: string) => string | null
}

const TEXT = 3
const ELEMENT = 1
const BLOCK = new Set(['DIV', 'P'])

export function domToText(root: NodeLike): string {
  let out = ''
  const walk = (n: NodeLike) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === TEXT) {
        out += (c.textContent ?? '').replace(/​/g, '')
      } else if (c.nodeType === ELEMENT) {
        const name = c.getAttribute?.('data-var')
        if (name != null) out += `{${name}}`
        else if (c.nodeName === 'BR') out += '\n'
        else {
          if (BLOCK.has(c.nodeName) && out !== '' && !out.endsWith('\n')) out += '\n'
          walk(c)
        }
      }
    }
  }
  walk(root)
  if (endsWithBr(root) && out.endsWith('\n')) out = out.slice(0, -1)
  return out
}

/** <br> ตัวสุดท้ายของเนื้อหา (ลึกสุดทางขวา ข้าม text ว่าง) — เบราว์เซอร์ใส่ไว้ให้บรรทัดว่างท้ายสุดมีความสูง */
function endsWithBr(n: NodeLike): boolean {
  const kids = Array.from(n.childNodes)
  for (let i = kids.length - 1; i >= 0; i--) {
    const c = kids[i]
    if (c.nodeType === TEXT && (c.textContent ?? '').replace(/​/g, '') === '') continue
    if (c.nodeType !== ELEMENT || c.getAttribute?.('data-var') != null) return false
    if (c.nodeName === 'BR') return true
    return endsWithBr(c)
  }
  return false
}
