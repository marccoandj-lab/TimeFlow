import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBe5OU-FAlkPPUPZFv3T7Due7dSlq1gS2I",
  authDomain: "timeflow-55487.firebaseapp.com",
  projectId: "timeflow-55487",
  storageBucket: "timeflow-55487.firebasestorage.app",
  messagingSenderId: "596272507645",
  appId: "1:596272507645:web:c0a3c6060318c75659ac94"
}

let app = null
let auth = null
let db = null

try {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = initializeFirestore(app, {
    cache: CACHE_SIZE_UNLIMITED
  })
} catch (error) {
  console.error('Firebase initialization error:', error)
}

export { app, auth, db }
export default app