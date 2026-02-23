import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
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

const mapAuthErrorMessage = (error) => {
  const code = error?.code ?? ''
  if (code === 'auth/invalid-email') {
    return 'Email 格式不正確'
  }
  if (
    code === 'auth/invalid-credential'
    || code === 'auth/wrong-password'
    || code === 'auth/user-not-found'
  ) {
    return '帳號或密碼錯誤'
  }
  if (code === 'auth/too-many-requests') {
    return '嘗試次數過多，請稍後再試'
  }
  return error?.message || 'Email 登入失敗'
}

export const loginWithEmailPassword = async ({ email, password }) => {
  const auth = ensureAuth()
  try {
    return await signInWithEmailAndPassword(auth, email, password)
  } catch (error) {
    throw new Error(mapAuthErrorMessage(error))
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
