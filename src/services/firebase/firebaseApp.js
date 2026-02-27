import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredKeys = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
]

export const isFirebaseConfigured = requiredKeys.every((value) => Boolean(value))

export const firebaseApp = isFirebaseConfigured
  ? initializeApp(firebaseConfig)
  : null

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
export const firestoreDb = firebaseApp ? getFirestore(firebaseApp) : null

const recaptchaSiteKey = import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY
export const isAppCheckConfigured = Boolean(recaptchaSiteKey)

export const firebaseAppCheck = (
  firebaseApp
  && import.meta.env.PROD
  && isAppCheckConfigured
)
  ? initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
  : null

export const assertFirebaseConfigured = () => {
  if (!isFirebaseConfigured) {
    throw new Error('Missing Firebase config. Check VITE_FIREBASE_* in .env.local or GitHub Secrets.')
  }
}

if (firebaseApp && import.meta.env.PROD && !isAppCheckConfigured) {
  console.warn('App Check is not configured. Set VITE_FIREBASE_RECAPTCHA_SITE_KEY for production.')
}
