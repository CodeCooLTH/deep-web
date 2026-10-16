'use client'

// ตัวกั้นฉาก 3D: ไม่มี WebGL / เรนเดอร์พัง / chunk โหลดไม่ได้ / บริบท WebGL หาย → แสดง fallback (รายการ 2D) ที่ผู้เรียกส่งมา
import { Component, type ReactNode } from 'react'

export type SceneFailReason = 'unsupported' | 'error' | 'lost'

type Props = {
  /** ผู้เรียกส่ง 2D list มา — ข้อมูลชุดเดียวกับฉาก */
  fallback: (reason: SceneFailReason) => ReactNode
  children: ReactNode
  onFail?: (reason: SceneFailReason) => void
}
type State = { reason: SceneFailReason | null; checked: boolean }

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // คืนบริบททดสอบทันที (เบราว์เซอร์จำกัดจำนวน)
    return !!gl
  } catch {
    return false
  }
}

export class DeskSceneBoundary extends Component<Props, State> {
  state: State = { reason: null, checked: false }
  private el: HTMLDivElement | null = null

  static getDerivedStateFromError(): Partial<State> { return { reason: 'error' } }

  componentDidCatch() { this.props.onFail?.('error') }

  componentDidMount() {
    // ตรวจหลัง mount เพราะ SSR ไม่มี document · ผลเป็น state เดียวกับ error จึงไม่มีฉากโผล่แล้วหาย
    if (!hasWebGL()) { this.setState({ reason: 'unsupported', checked: true }); this.props.onFail?.('unsupported'); return }
    this.setState({ checked: true })
  }

  componentWillUnmount() { this.el?.removeEventListener('webglcontextlost', this.onLost, true) }

  // webglcontextlost ไม่ bubble แต่ดักที่ตัวแม่ด้วย capture ได้ จึงไม่ต้องส่ง callback ลงไปใน canvas
  private onLost = () => { this.setState({ reason: 'lost' }); this.props.onFail?.('lost') }
  private setEl = (el: HTMLDivElement | null) => {
    this.el?.removeEventListener('webglcontextlost', this.onLost, true)
    this.el = el
    el?.addEventListener('webglcontextlost', this.onLost, true)
  }

  render() {
    const { reason, checked } = this.state
    if (reason) return this.props.fallback(reason)
    return <div ref={this.setEl} className="relative size-full">{checked ? this.props.children : null}</div>
  }
}

export default DeskSceneBoundary
