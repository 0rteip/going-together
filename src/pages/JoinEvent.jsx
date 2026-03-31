import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import EventLocationMap from '../components/EventLocationMap'
import { useAuth } from '../context/useAuth'
import { db } from '../firebase'

function JoinEvent() {
  const { token } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser } = useAuth()

  const [eventData, setEventData] = useState(null)
  const [loadingEvent, setLoadingEvent] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [requiresAuthToLoad, setRequiresAuthToLoad] = useState(false)

  useEffect(() => {
    const fetchEventByToken = async () => {
      if (!token) {
        setEventData(null)
        setLoadingEvent(false)
        return
      }

      if (!currentUser) {
        setRequiresAuthToLoad(true)
        setLoadingEvent(false)
        setError('')
        return
      }

      try {
        setLoadingEvent(true)
        setRequiresAuthToLoad(false)
        setError('')

        const eventsRef = collection(db, 'events')
        const q = query(eventsRef, where('inviteToken', '==', token), limit(1))
        const snapshot = await getDocs(q)

        if (snapshot.empty) {
          setEventData(null)
          return
        }

        const firstDoc = snapshot.docs[0]
        setEventData({ id: firstDoc.id, ...firstDoc.data() })
      } catch {
        setError('Impossibile caricare l evento. Riprova dopo il login.')
      } finally {
        setLoadingEvent(false)
      }
    }

    fetchEventByToken()
  }, [token, currentUser])

  const formattedDate = useMemo(() => {
    if (!eventData?.date) {
      return null
    }

    try {
      return new Date(`${eventData.date}T${eventData.time || '00:00'}`).toLocaleString('it-IT', {
        dateStyle: 'full',
        timeStyle: eventData.time ? 'short' : undefined,
      })
    } catch {
      return `${eventData.date} ${eventData.time || ''}`.trim()
    }
  }, [eventData])

  const handleJoin = async () => {
    if (!eventData) {
      return
    }

    if (!currentUser) {
      navigate('/login', {
        state: { from: { pathname: location.pathname } },
      })
      return
    }

    try {
      setJoining(true)
      setError('')

      const participantId = `${eventData.id}_${currentUser.uid}`
      const participantRef = doc(db, 'participants', participantId)
      const participantSnapshot = await getDoc(participantRef)

      const participantIdentity = {
        userName: currentUser.displayName || null,
        userEmail: currentUser.email || null,
      }

      if (!participantSnapshot.exists()) {
        await setDoc(participantRef, {
          id: participantId,
          eventId: eventData.id,
          userId: currentUser.uid,
          ...participantIdentity,
          outwardTrip: null,
          returnTrip: null,
          createdAt: serverTimestamp(),
        })
      } else {
        await setDoc(participantRef, participantIdentity, { merge: true })
      }

      navigate('/dashboard', { replace: true })
    } catch {
      setError('Iscrizione non riuscita. Riprova.')
    } finally {
      setJoining(false)
    }
  }

  if (loadingEvent) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm text-slate-600">Caricamento evento...</p>
      </section>
    )
  }

  if (!eventData) {
    if (requiresAuthToLoad) {
      return (
        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-slate-900">Invito evento</h1>
          <p className="mt-2 text-slate-600">Accedi per visualizzare i dettagli e partecipare all evento.</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() =>
                navigate('/login', {
                  state: { from: { pathname: location.pathname } },
                })
              }
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Accedi
            </button>

            <button
              type="button"
              onClick={() =>
                navigate('/register', {
                  state: { from: { pathname: location.pathname } },
                })
              }
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Registrati
            </button>
          </div>
        </section>
      )
    }

    return (
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Invito non valido</h1>
        <p className="mt-2 text-slate-600">Il link di invito non corrisponde a nessun evento.</p>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Invito evento</h1>
      <p className="mt-2 text-sm text-slate-600">Sei stato invitato a partecipare.</p>

      <div className="mt-6 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
        {/* <p className="text-sm text-slate-500">Nome evento</p> */}
        <p className="text-lg font-semibold text-slate-900">{eventData.name}</p>
        <p className="text-sm text-slate-600">{formattedDate || 'Data da definire'}</p>
      </div>

      <div className="mt-5">
        <EventLocationMap location={eventData.location} />
      </div>

      {!currentUser ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Effettua il login o registrati per partecipare a questo evento.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleJoin}
        disabled={joining}
        className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {joining ? 'Iscrizione in corso...' : 'Partecipa a questo evento'}
      </button>
    </section>
  )
}

export default JoinEvent
