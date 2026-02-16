import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

const getCachedUser = () => {
  try {
    const cached = localStorage.getItem('timeflow_cachedUser')
    if (cached) return JSON.parse(cached)
  } catch {}
  return null
}

const setCachedUser = (user) => {
  try {
    if (user) {
      localStorage.setItem('timeflow_cachedUser', JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL
      }))
    } else {
      localStorage.removeItem('timeflow_cachedUser')
    }
  } catch {}
}

export function AuthProvider({ children }) {
  const cachedUser = getCachedUser()
  const [currentUser, setCurrentUser] = useState(cachedUser)
  const [userData, setUserData] = useState(() => {
    try {
      const cached = localStorage.getItem('timeflow_userData')
      return cached ? JSON.parse(cached) : null
    } catch { return null }
  })
  const [loading, setLoading] = useState(!cachedUser)
  const [error, setError] = useState(null)
  const isMountedRef = useRef(true)
  const unsubscribesRef = useRef([])

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
    return signInWithRedirect(auth, provider)
  }

  function logout() {
    if (!auth) return Promise.resolve()
    localStorage.removeItem('timeflow_userId')
    localStorage.removeItem('timeflow_userData')
    localStorage.removeItem('timeflow_cachedUser')
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
      if (userSnap.exists() && isMountedRef.current) {
        const data = userSnap.data()
        setUserData(data)
        localStorage.setItem('timeflow_userData', JSON.stringify(data))
      }
    } catch (err) {
      if (err.code === 'unavailable' || err.message?.includes('offline')) {
        console.warn('Firestore offline - using cached data')
      } else {
        console.error('Error fetching user data:', err)
      }
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    
    if (!auth) {
      setLoading(false)
      setError('Firebase not configured. Please add environment variables.')
      return
    }

    getRedirectResult(auth).then(async (result) => {
      if (result?.user) {
        console.log('🔐 Google redirect success:', result.user.uid)
        const userRef = doc(db, 'users', result.user.uid)
        const userSnap = await getDoc(userRef)
        if (!userSnap.exists()) {
          console.log('📝 Creating new user document for Google login')
          await setDoc(userRef, {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
            photoURL: result.user.photoURL,
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
      }
    }).catch((err) => {
      console.error('Google redirect error:', err)
    })

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMountedRef.current) return
      
      console.log('🔐 Auth state changed:', user ? user.uid : 'null')
      
      setCurrentUser(user)
      setCachedUser(user)
      if (user) {
        localStorage.setItem('timeflow_userId', user.uid)
        try {
          await fetchUserData(user.uid)
        } catch (err) {
          console.error('fetchUserData error:', err)
        }
      } else {
        setUserData(null)
        localStorage.removeItem('timeflow_userData')
      }
      if (isMountedRef.current) {
        setLoading(false)
      }
    }, (err) => {
      console.error('Auth error:', err)
      if (isMountedRef.current) {
        setError(err.message)
        setLoading(false)
      }
    })

    unsubscribesRef.current.push(unsubscribe)
    
    return () => {
      isMountedRef.current = false
      unsubscribesRef.current.forEach(unsub => unsub())
      unsubscribesRef.current = []
    }
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