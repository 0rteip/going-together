import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteUser } from 'firebase/auth'
import { collection, deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore'
import { useAuth } from '../context/useAuth'
import { db } from '../firebase'

function Settings() {
  const { currentUser, logout } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loadingAction, setLoadingAction] = useState('')

  const deleteDocRefsInBatches = async (refs, batchSize = 400) => {
    for (let i = 0; i < refs.length; i += batchSize) {
      const chunk = refs.slice(i, i + batchSize)
      const batch = writeBatch(db)
      chunk.forEach((ref) => {
        batch.delete(ref)
      })
      await batch.commit()
    }
  }

  const handleLogout = async () => {
    try {
      setLoadingAction('logout')
      setError('')
      await logout()
      navigate('/login', { replace: true })
    } catch (err) {
      console.error('Error during logout:', err)
      setError('Impossibile effettuare il logout. Riprova.')
    } finally {
      setLoadingAction('')
    }
  }

  const handleDeleteProfile = async () => {
    if (!currentUser) return

    const shouldDelete = window.confirm(
      'Confermi la cancellazione del profilo? Verranno eliminati anche eventi creati da te e partecipazioni collegate.',
    )
    if (!shouldDelete) return

    try {
      setLoadingAction('delete-profile')
      setError('')

      const ownedEventsQuery = query(collection(db, 'events'), where('adminId', '==', currentUser.uid))
      const ownedEventsSnap = await getDocs(ownedEventsQuery)

      for (const eventDoc of ownedEventsSnap.docs) {
        const eventId = eventDoc.id
        const participantsQuery = query(collection(db, 'participants'), where('eventId', '==', eventId))
        const participantsSnap = await getDocs(participantsQuery)

        const refsToDelete = participantsSnap.docs.map((participantDoc) => participantDoc.ref)
        refsToDelete.push(eventDoc.ref)

        await deleteDocRefsInBatches(refsToDelete)
      }

      const myParticipantsQuery = query(
        collection(db, 'participants'),
        where('userId', '==', currentUser.uid),
      )
      const myParticipantsSnap = await getDocs(myParticipantsQuery)
      if (!myParticipantsSnap.empty) {
        await deleteDocRefsInBatches(myParticipantsSnap.docs.map((participantDoc) => participantDoc.ref))
      }

      await deleteDoc(doc(db, 'users', currentUser.uid))
      await deleteUser(currentUser)

      navigate('/register', { replace: true })
    } catch (err) {
      console.error('Error deleting profile:', err)
      if (err?.code === 'auth/requires-recent-login') {
        setError('Per eliminare il profilo, effettua nuovamente il login e riprova.')
      } else {
        setError('Impossibile eliminare il profilo. Riprova.')
      }
    } finally {
      setLoadingAction('')
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Impostazioni Account</h1>
        <p className="mt-2 text-slate-600">Gestisci accesso e profilo.</p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loadingAction === 'logout' || loadingAction === 'delete-profile'}
            className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingAction === 'logout' ? 'Logout in corso...' : 'Logout'}
          </button>

          <button
            type="button"
            onClick={handleDeleteProfile}
            disabled={loadingAction === 'logout' || loadingAction === 'delete-profile'}
            className="inline-flex w-full items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingAction === 'delete-profile' ? 'Eliminazione profilo...' : 'Cancella profilo'}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
    </section>
  )
}

export default Settings
