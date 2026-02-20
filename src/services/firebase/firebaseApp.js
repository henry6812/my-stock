import { initializeApp } from 'firebase/app'
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

export const assertFirebaseConfigured = () => {
  if (!isFirebaseConfigured) {
    throw new Error('Missing Firebase config. Check VITE_FIREBASE_* in .env.local or GitHub Secrets.')
  }
}
