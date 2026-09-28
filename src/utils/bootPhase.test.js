import { describe, it, expect } from 'vitest'
import { getBootPhase } from './bootPhase'

// getBootPhase decides what the app shell renders on startup, so a returning
// user never sees the stale local cache before the first cloud sync finishes.
// authReady flips true only after auth resolves AND (when logged in) the
// initial sync + load has completed (App.jsx observeAuthState `finally`).
describe('getBootPhase', () => {
  it('is "loading" before auth has resolved (no user yet)', () => {
    expect(getBootPhase({ authReady: false, authUser: null })).toBe('loading')
  })

  it('is "loading" while a logged-in user\'s initial sync is still running', () => {
    // authUser is already set (observeAuthState fired) but authReady is still
    // false because initSync + loadAllData have not finished — this is exactly
    // the window where the old code flashed stale data.
    expect(getBootPhase({ authReady: false, authUser: { uid: 'u1' } })).toBe(
      'loading',
    )
  })

  it('is "login" once auth resolved with no user', () => {
    expect(getBootPhase({ authReady: true, authUser: null })).toBe('login')
  })

  it('is "ready" once auth resolved and the initial sync completed', () => {
    expect(getBootPhase({ authReady: true, authUser: { uid: 'u1' } })).toBe(
      'ready',
    )
  })

  it('tolerates missing/omitted fields (defaults to loading)', () => {
    expect(getBootPhase({})).toBe('loading')
    expect(getBootPhase()).toBe('loading')
  })
})
