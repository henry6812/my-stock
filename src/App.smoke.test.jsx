import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { App as AntdApp } from 'antd'

// virtual:pwa-register only exists inside the Vite PWA plugin.
vi.mock('./pwaUpdate', () => ({
  applyPwaUpdate: async () => {},
  onPwaNeedRefresh: () => () => {},
}))

import App from './App'

// A render-time error in App (e.g. reading a const before its declaration)
// unmounts the whole tree and leaves a blank page with no visible error.
describe('<App /> smoke', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <AntdApp>
        <App />
      </AntdApp>,
    )
    expect(container.textContent.length).toBeGreaterThan(0)
  })
})
