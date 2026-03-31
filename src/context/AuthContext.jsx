import { useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  updateProfile,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import AuthContext from './auth-context'

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password)

  const register = async (name, email, password) => {
    const credentials = await createUserWithEmailAndPassword(auth, email, password)
    const displayName = name.trim()

    await updateProfile(credentials.user, { displayName })

    await setDoc(
      doc(db, 'users', credentials.user.uid),
      {
        id: credentials.user.uid,
        name: displayName,
        email: credentials.user.email,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    )

    return credentials
  }

  const logout = () => signOut(auth)

  const value = useMemo(
    () => ({
      currentUser,
      login,
      register,
      logout,
      loading,
    }),
    [currentUser, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
