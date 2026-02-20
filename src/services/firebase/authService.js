import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import {
  assertFirebaseConfigured,
  firebaseAuth,
} from './firebaseApp'

const provider = new GoogleAuthProvider()

const ensureAuth = () => {
  assertFirebaseConfigured()
  if (!firebaseAuth) {
    throw new Error('Firebase auth is unavailable.')
  }
  return firebaseAuth
}

const shouldUseRedirectFallback = (error) => {
  const code = error?.code ?? ''
  return (
    code === 'auth/popup-blocked'
    || code === 'auth/popup-closed-by-user'
    || code === 'auth/cancelled-popup-request'
    || code === 'auth/operation-not-supported-in-this-environment'
  )
}

export const loginWithGoogle = async () => {
  const auth = ensureAuth()
  try {
    return await signInWithPopup(auth, provider)
  } catch (error) {
    if (shouldUseRedirectFallback(error)) {
      await signInWithRedirect(auth, provider)
      return null
    }
    throw error
  }
}

export const logoutGoogle = async () => {
  const auth = ensureAuth()
  await signOut(auth)
}

export const observeAuthState = (callback) => {
  if (!firebaseAuth) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(firebaseAuth, callback)
}
