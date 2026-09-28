// Decides what the app shell renders on startup.
//
//   'loading' — auth state has not resolved yet, OR a logged-in user's first
//               cloud sync + load is still running. Show a loading view so the
//               stale local cache is never painted before the authoritative
//               cloud data arrives.
//   'login'   — auth resolved, nobody signed in.
//   'ready'   — auth resolved and (for a signed-in user) the initial sync done.
//
// `authReady` is set true by App.jsx only after auth resolves and, when a user
// is present, after the initial initSync + loadAllData completes.
export const getBootPhase = ({ authReady, authUser } = {}) => {
  if (!authReady) {
    return 'loading'
  }
  if (!authUser) {
    return 'login'
  }
  return 'ready'
}
