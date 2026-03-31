import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'
import { useAuth } from '../context/useAuth'
import { db } from '../firebase'

function Dashboard() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [participantDataMap, setParticipantDataMap] = useState({})
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [copiedInviteId, setCopiedInviteId] = useState('')

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

  useEffect(() => {
    const loadEvents = async () => {
      if (!currentUser) {
        return
      }

      try {
        setLoading(true)
        setError('')

        const participantsQuery = query(
          collection(db, 'participants'),
          where('userId', '==', currentUser.uid),
        )
        const participantsSnapshot = await getDocs(participantsQuery)

        if (participantsSnapshot.empty) {
          setEvents([])
          setParticipantDataMap({})
          return
        }

        const eventIds = participantsSnapshot.docs
          .map((participantDoc) => participantDoc.data().eventId)
          .filter(Boolean)

        // Memo mappa participant per ogni evento
        const participantMap = {}
        participantsSnapshot.docs.forEach((participantDoc) => {
          const eventId = participantDoc.data().eventId
          participantMap[eventId] = {
            ...participantDoc.data(),
            participantDocId: participantDoc.id,
          }
        })
        setParticipantDataMap(participantMap)

        const eventPromises = eventIds.map((eventId) => getDoc(doc(db, 'events', eventId)))
        const eventSnapshots = await Promise.all(eventPromises)

        const loadedEvents = eventSnapshots
          .filter((eventSnapshot) => eventSnapshot.exists())
          .map((eventSnapshot) => ({ id: eventSnapshot.id, ...eventSnapshot.data() }))

        setEvents(loadedEvents)
      } catch {
        setError('Impossibile recuperare gli eventi. Riprova.')
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [currentUser])

  // Navigazione condizionale: se il participant ha già trip data, va a /map, altrimenti a /preferences
  const handleEventClick = (eventItem) => {
    const participantData = participantDataMap[eventItem.id]
    const hasOutwardTrip = participantData?.outwardTrip?.type
    const hasReturnTrip = participantData?.returnTrip?.type

    if (hasOutwardTrip || hasReturnTrip) {
      navigate(`/event/${eventItem.id}/map`)
    } else {
      navigate(`/event/${eventItem.id}/preferences`)
    }
  }

  const handleDeleteEventGlobal = async (eventItem) => {
    if (!currentUser || eventItem.adminId !== currentUser.uid) return

    const shouldDelete = window.confirm(
      `Confermi l'eliminazione definitiva di "${eventItem.name}" per tutti i partecipanti?`,
    )
    if (!shouldDelete) return

    try {
      setActionLoadingId(`delete-${eventItem.id}`)

      const participantsQuery = query(
        collection(db, 'participants'),
        where('eventId', '==', eventItem.id),
      )
      const participantsSnap = await getDocs(participantsQuery)

      const refsToDelete = participantsSnap.docs.map((participantDoc) => participantDoc.ref)
      refsToDelete.push(doc(db, 'events', eventItem.id))

      await deleteDocRefsInBatches(refsToDelete)

      setEvents((prev) => prev.filter((event) => event.id !== eventItem.id))
      setParticipantDataMap((prev) => {
        const next = { ...prev }
        delete next[eventItem.id]
        return next
      })
    } catch (err) {
      console.error('Error deleting event globally:', err)
      setError('Impossibile eliminare l\'evento. Riprova.')
    } finally {
      setActionLoadingId('')
    }
  }

  const handleLeaveEvent = async (eventItem) => {
    if (!currentUser) return

    if (eventItem.adminId === currentUser.uid) {
      setError('Sei admin di questo evento. Usa "Elimina evento" per rimuoverlo globalmente.')
      return
    }

    const shouldLeave = window.confirm(`Vuoi rimuovere "${eventItem.name}" solo dal tuo account?`)
    if (!shouldLeave) return

    try {
      setActionLoadingId(`leave-${eventItem.id}`)

      let participantDocId = participantDataMap[eventItem.id]?.participantDocId

      if (!participantDocId) {
        const participantQuery = query(
          collection(db, 'participants'),
          where('eventId', '==', eventItem.id),
          where('userId', '==', currentUser.uid),
        )
        const participantSnap = await getDocs(participantQuery)
        participantDocId = participantSnap.docs[0]?.id
      }

      if (!participantDocId) {
        setError('Partecipazione non trovata per questo evento.')
        return
      }

      await deleteDoc(doc(db, 'participants', participantDocId))

      setEvents((prev) => prev.filter((event) => event.id !== eventItem.id))
      setParticipantDataMap((prev) => {
        const next = { ...prev }
        delete next[eventItem.id]
        return next
      })
    } catch (err) {
      console.error('Error leaving event:', err)
      setError('Impossibile rimuovere l\'evento dal tuo account.')
    } finally {
      setActionLoadingId('')
    }
  }

  const handleCopyInviteLink = async (eventItem) => {
    if (!eventItem.inviteToken) {
      setError('Link invito non disponibile per questo evento.')
      return
    }

    const appBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
    const inviteLink = new URL(`join/${eventItem.inviteToken}`, appBaseUrl).toString()

    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopiedInviteId(eventItem.id)
      setTimeout(() => {
        setCopiedInviteId((current) => (current === eventItem.id ? '' : current))
      }, 1800)
    } catch (err) {
      console.error('Error copying invite link:', err)
      setError('Impossibile copiare il link invito. Riprova.')
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Benvenuto</h1>
        <p className="mt-2 text-slate-600">Organizza un nuovo evento.</p>

        <Link
          to="/create-event"
          className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Crea Nuovo Evento
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-semibold text-slate-900">Eventi a cui partecipi</h2>

        {loading ? <p className="mt-4 text-sm text-slate-600">Caricamento eventi...</p> : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {!loading && !error && events.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            Nessun evento trovato. Usa un link invito o crea un nuovo evento.
          </p>
        ) : null}

        {!loading && events.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {events.map((eventItem) => (
              <li key={eventItem.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEventClick(eventItem)}
                        className="truncate text-left text-base font-semibold text-slate-900 transition hover:opacity-90"
                      >
                        {eventItem.name}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyInviteLink(eventItem)}
                        aria-label="Copia link invito"
                        title={copiedInviteId === eventItem.id ? 'Copiato' : 'Copia link invito'}
                        className={`shrink-0 rounded-md border bg-white p-1.5 transition ${
                          copiedInviteId === eventItem.id
                            ? 'border-emerald-300 text-emerald-700'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {copiedInviteId === eventItem.id ? (
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path
                              fillRule="evenodd"
                              d="M16.704 5.29a1 1 0 010 1.414l-7.2 7.2a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l2.293 2.293 6.493-6.493a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M6 2a2 2 0 00-2 2v8a2 2 0 002 2h1v2a2 2 0 002 2h7a2 2 0 002-2V8a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H6z" />
                            <path d="M8 6V4h5v2H9a1 1 0 00-1 1v5H6V4h1v2h1z" />
                          </svg>
                        )}
                      </button>
                    </div>

                    <p className="mt-1 text-sm text-slate-600">
                      {eventItem.date || 'Data da definire'} {eventItem.time || ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                  {eventItem.adminId === currentUser?.uid ? (
                    <button
                      type="button"
                      disabled={actionLoadingId === `delete-${eventItem.id}`}
                      onClick={() => handleDeleteEventGlobal(eventItem)}
                      aria-label="Elimina evento (per tutti)"
                      title="Elimina evento (per tutti)"
                      className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionLoadingId === `delete-${eventItem.id}`
                        ? '...'
                        : (
                            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                              <path
                                fillRule="evenodd"
                                d="M8.5 2a1 1 0 00-.894.553L7.382 3H4a1 1 0 100 2h.42l.805 10.06A2 2 0 007.22 17h5.56a2 2 0 001.995-1.94L15.58 5H16a1 1 0 100-2h-3.382l-.224-.447A1 1 0 0011.5 2h-3zm1 5a1 1 0 10-2 0v6a1 1 0 102 0V7zm3 0a1 1 0 10-2 0v6a1 1 0 102 0V7z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionLoadingId === `leave-${eventItem.id}`}
                      onClick={() => handleLeaveEvent(eventItem)}
                      aria-label="Rimuovi evento per me"
                      title="Rimuovi evento per me"
                      className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionLoadingId === `leave-${eventItem.id}`
                        ? '...'
                        : (
                            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                              <path
                                fillRule="evenodd"
                                d="M8.5 2a1 1 0 00-.894.553L7.382 3H4a1 1 0 100 2h.42l.805 10.06A2 2 0 007.22 17h5.56a2 2 0 001.995-1.94L15.58 5H16a1 1 0 100-2h-3.382l-.224-.447A1 1 0 0011.5 2h-3zm1 5a1 1 0 10-2 0v6a1 1 0 102 0V7zm3 0a1 1 0 10-2 0v6a1 1 0 102 0V7z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                    </button>
                  )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}

export default Dashboard
