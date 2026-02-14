import { createContext, useContext, useState, useEffect } from 'react'
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function signup(email, password, displayName) {
    if (!auth) throw new Error('Firebase not initialized')
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(userCredential.user, { displayName })
    
    if (db) {
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        email,
        displayName,
        photoURL: null,
        createdAt: serverTimestamp(),
        settings: {
          darkMode: false,
          notifications: true,
          pomodoroDuration: 25,
          shortBreakDuration: 5,
          longBreakDuration: 15
        }
      })
    }
    
    return userCredential
  }

  function login(email, password) {
    if (!auth) throw new Error('Firebase not initialized')
    return signInWithEmailAndPassword(auth, email, password)
  }

  function loginWithGoogle() {
    if (!auth) throw new Error('Firebase not initialized')
    const provider = new GoogleAuthProvider()
    return signInWithPopup(auth, provider)
  }

  function logout() {
    if (!auth) return Promise.resolve()
    return signOut(auth)
  }

  function resetPassword(email) {
    if (!auth) throw new Error('Firebase not initialized')
    return sendPasswordResetEmail(auth, email)
  }

  async function updateUserProfile(updates) {
    if (!currentUser) return
    
    if (updates.displayName || updates.photoURL) {
      await updateProfile(currentUser, {
        displayName: updates.displayName || currentUser.displayName,
        photoURL: updates.photoURL || currentUser.photoURL
      })
    }
    
    if (db) {
      const userRef = doc(db, 'users', currentUser.uid)
      await setDoc(userRef, { ...updates, updatedAt: serverTimestamp() }, { merge: true })
    }
    
    setUserData(prev => ({ ...prev, ...updates }))
  }

  async function fetchUserData(uid) {
    if (!db) return
    try {
      const userRef = doc(db, 'users', uid)
      const userSnap = await getDoc(userRef)
      if (userSnap.exists()) {
        setUserData(userSnap.data())
      }
    } catch (err) {
      console.error('Error fetching user data:', err)
    }
  }

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      setError('Firebase not configured. Please add environment variables.')
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)
      if (user) {
        await fetchUserData(user.uid)
      } else {
        setUserData(null)
      }
      setLoading(false)
    }, (err) => {
      console.error('Auth error:', err)
      setError(err.message)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const value = {
    currentUser,
    userData,
    loading,
    error,
    signup,
    login,
    loginWithGoogle,
    logout,
    resetPassword,
    updateUserProfile,
    fetchUserData
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}