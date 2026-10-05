import { describe, it, expect, vi } from 'vitest'
import { createPortal } from 'react-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { isFromPortal } from './portalEvent'

// React bubbles events through portals along the component tree, so a touch
// inside a sheet (portalled to <body>) reaches handlers on the page content
// that renders it.
function Page({ onTouchStart }) {
  return (
    <div onTouchStart={onTouchStart}>
      <p>page content</p>
      {createPortal(<p>sheet content</p>, document.body)}
    </div>
  )
}

describe('isFromPortal', () => {
  it('is false for a touch on the element’s own DOM content', () => {
    const seen = vi.fn()
    render(<Page onTouchStart={(event) => seen(isFromPortal(event))} />)
    fireEvent.touchStart(screen.getByText('page content'), { touches: [{ clientY: 10 }] })
    expect(seen).toHaveBeenCalledWith(false)
  })

  it('is true for a touch that bubbled up from a portal, such as a sheet', () => {
    const seen = vi.fn()
    render(<Page onTouchStart={(event) => seen(isFromPortal(event))} />)
    fireEvent.touchStart(screen.getByText('sheet content'), { touches: [{ clientY: 10 }] })
    expect(seen).toHaveBeenCalledWith(true)
  })
})
