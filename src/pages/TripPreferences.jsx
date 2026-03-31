import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { useAuth } from '../context/useAuth'
import { db } from '../firebase'

const EMPTY_TRIP = {
  type: '',
  startLocation: null,
  endLocation: null,
  needsLastMileRide: false,
}

function TripPreferences() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { currentUser } = useAuth()

  const [outwardTrip, setOutwardTrip] = useState(EMPTY_TRIP)
  const [returnTrip, setReturnTrip] = useState(EMPTY_TRIP)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Carica i dati salvati se esistono
  useEffect(() => {
    const loadPreferences = async () => {
      if (!eventId || !currentUser) return

      try {
        setLoading(true)
        setError('')

        const participantQuery = query(
          collection(db, 'participants'),
          where('eventId', '==', eventId),
          where('userId', '==', currentUser.uid),
        )

        const participantSnap = await getDocs(participantQuery)
        if (!participantSnap.empty) {
          const participantData = participantSnap.docs[0].data()
          if (participantData.outwardTrip) {
            setOutwardTrip({
              type: participantData.outwardTrip.type || '',
              startLocation: participantData.outwardTrip.startLocation || null,
              endLocation: participantData.outwardTrip.endLocation || null,
              needsLastMileRide: participantData.outwardTrip.needsLastMileRide || false,
            })
          }
          if (participantData.returnTrip) {
            setReturnTrip({
              type: participantData.returnTrip.type || '',
              startLocation: participantData.returnTrip.startLocation || null,
              endLocation: participantData.returnTrip.endLocation || null,
              needsLastMileRide: participantData.returnTrip.needsLastMileRide || false,
            })
          }
        }
      } catch (err) {
        console.error('Error loading preferences:', err)
        setError('Impossibile caricare le preferenze.')
      } finally {
        setLoading(false)
      }
    }

    loadPreferences()
  }, [eventId, currentUser])

  // Valida che una location abbia coordinate valide
  const isValidLocation = (location) => {
    return (
      location &&
      typeof location.lat === 'number' &&
      typeof location.lng === 'number' &&
      isFinite(location.lat) &&
      isFinite(location.lng)
    )
  }

  // Risolvi un indirizzo tramite Nominatim se mancano coordinate
  const resolveLocation = async (location) => {
    if (isValidLocation(location)) {
      return location
    }

    if (!location.address) {
      throw new Error('Indirizzo non valido.')
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location.address)}&countrycodes=it&limit=1`,
      )
      if (!response.ok) throw new Error('Errore Nominatim')

      const data = await response.json()
      if (data.length === 0) {
        throw new Error('Nessun risultato trovato per questo indirizzo.')
      }

      return {
        address: data[0].display_name,
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      }
    } catch (err) {
      console.error('Geocoding error:', err)
      throw err
    }
  }

  // Costruisci il payload del viaggio
  const buildTripPayload = (trip) => {
    if (trip.type === 'transit') {
      return {
        type: 'transit',
        startLocation: trip.startLocation,
        endLocation: null,
        needsLastMileRide: false,
      }
    }
    if (trip.type === 'driver' || trip.type === 'passenger') {
      return {
        type: trip.type,
        startLocation: trip.startLocation,
        endLocation: trip.endLocation,
        needsLastMileRide: trip.needsLastMileRide || false,
      }
    }
    return EMPTY_TRIP
  }

  // Salva le preferenze
  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')

      // Da che almeno un'opzione sia selezionata
      if (!outwardTrip.type && !returnTrip.type) {
        setError('Seleziona almeno un tipo di viaggio.')
        return
      }

      // Risolvi locations se necessarie
      let resolvedOutwardTrip = { ...outwardTrip }
      let resolvedReturnTrip = { ...returnTrip }

      if (outwardTrip.type) {
        if (outwardTrip.startLocation) {
          resolvedOutwardTrip.startLocation = await resolveLocation(outwardTrip.startLocation)
        }
        if (outwardTrip.endLocation) {
          resolvedOutwardTrip.endLocation = await resolveLocation(outwardTrip.endLocation)
        }
      }

      if (returnTrip.type) {
        if (returnTrip.startLocation) {
          resolvedReturnTrip.startLocation = await resolveLocation(returnTrip.startLocation)
        }
        if (returnTrip.endLocation) {
          resolvedReturnTrip.endLocation = await resolveLocation(returnTrip.endLocation)
        }
      }

      // Validazione Andata: dipende dal tipo
      if (outwardTrip.type === 'transit') {
        if (!isValidLocation(resolvedOutwardTrip.startLocation)) {
          setError('Andata: Seleziona una stazione di partenza valida.')
          return
        }
        if (!isValidLocation(resolvedOutwardTrip.endLocation)) {
          setError('Andata: Seleziona una stazione di arrivo valida.')
          return
        }
      } else if (outwardTrip.type === 'driver' || outwardTrip.type === 'passenger') {
        if (!isValidLocation(resolvedOutwardTrip.startLocation)) {
          setError('Andata: Inserisci un punto di partenza valido.')
          return
        }
      }

      // Validazione Ritorno: dipende dal tipo
      if (returnTrip.type === 'transit') {
        if (!isValidLocation(resolvedReturnTrip.startLocation)) {
          setError('Ritorno: Seleziona una stazione di partenza valida.')
          return
        }
        if (!isValidLocation(resolvedReturnTrip.endLocation)) {
          setError('Ritorno: Seleziona una stazione di arrivo valida.')
          return
        }
      } else if (returnTrip.type === 'driver' || returnTrip.type === 'passenger') {
        // Per Driver/Passenger, valida solo la destinazione finale
        if (!isValidLocation(resolvedReturnTrip.endLocation)) {
          setError('Ritorno: Seleziona una destinazione finale valida.')
          return
        }
      }

      // Cerca il documento participant
      const participantQuery = query(
        collection(db, 'participants'),
        where('eventId', '==', eventId),
        where('userId', '==', currentUser.uid),
      )
      const participantSnap = await getDocs(participantQuery)

      if (participantSnap.empty) {
        setError('Partecipazione non trovata.')
        return
      }

      const participantDocId = participantSnap.docs[0].id

      // Salva
      const participantRef = doc(db, 'participants', participantDocId)
      await setDoc(
        participantRef,
        {
          outwardTrip: outwardTrip.type ? buildTripPayload(resolvedOutwardTrip) : null,
          returnTrip: returnTrip.type ? buildTripPayload(resolvedReturnTrip) : null,
        },
        { merge: true },
      )

      navigate(`/event/${eventId}/map`)
    } catch (err) {
      console.error('Error saving preferences:', err)
      setError(err.message || 'Errore nel salvataggio.')
    } finally {
      setSaving(false)
    }
  }

  // Componente riutilizzabile per selezione tipo di viaggio
  const TravelTypeSelector = ({ selectedType, onSelect }) => {
    const types = [
      { value: 'driver', label: 'Autista', icon: '🚗', borderClass: 'border-blue-500', bgClass: 'bg-blue-50' },
      { value: 'passenger', label: 'Passeggero', icon: '🙋', borderClass: 'border-green-500', bgClass: 'bg-green-50' },
      { value: 'transit', label: 'Trasporto Pubblico', icon: '🚆', borderClass: 'border-purple-500', bgClass: 'bg-purple-50' },
    ]

    return (
      <div className="grid grid-cols-3 gap-3">
        {types.map((type) => (
          <button
            key={type.value}
            onClick={() => onSelect(type.value === selectedType ? '' : type.value)}
            className={`rounded-lg border-2 p-4 text-center transition ${
              selectedType === type.value
                ? `${type.borderClass} ${type.bgClass}`
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="text-3xl">{type.icon}</div>
            <div className="mt-2 text-xs font-semibold text-slate-900">{type.label}</div>
          </button>
        ))}
      </div>
    )
  }

  if (loading)
    return (
      <section className="mx-auto max-w-3xl py-16 px-4">
        <p className="text-slate-600">Caricamento...</p>
      </section>
    )

  return (
    <section className="mx-auto max-w-3xl space-y-8 py-8 px-4">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">Preferenze di Viaggio</h1>
        <p className="mt-3 text-base text-slate-600">
          Specifica come vuoi arrivare e partire via dall'evento.
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Viaggio di Andata */}
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-3xl">🛫</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Viaggio di Andata</h2>
            <p className="text-sm text-slate-600">Come raggiungerai l'evento?</p>
          </div>
        </div>

        {/* Selezione tipo */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold text-slate-700">Tipo di Trasporto</label>
          <TravelTypeSelector
            selectedType={outwardTrip.type}
            onSelect={(type) =>
              setOutwardTrip({
                ...EMPTY_TRIP,
                type,
              })
            }
          />
        </div>

        {/* Campi specifici per Transit */}
        {outwardTrip.type === 'transit' && (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Stazione di Partenza
              </label>
              <AddressAutocomplete
                value={outwardTrip.startLocation}
                onChange={(value) =>
                  setOutwardTrip({
                    ...outwardTrip,
                    startLocation: value,
                  })
                }
                placeholder="Es. Stazione Centrale Milano"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Stazione di Arrivo (meglio se vicino all'evento)
              </label>
              <AddressAutocomplete
                value={outwardTrip.endLocation}
                onChange={(value) =>
                  setOutwardTrip({
                    ...outwardTrip,
                    endLocation: value,
                  })
                }
                placeholder="Es. Stazione vicino all'evento"
              />
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={outwardTrip.needsLastMileRide}
                  onChange={(e) =>
                    setOutwardTrip({
                      ...outwardTrip,
                      needsLastMileRide: e.target.checked,
                    })
                  }
                  className="mt-1 h-5 w-5 cursor-pointer rounded border-slate-300 text-amber-600"
                />
                <span className="text-sm font-medium text-amber-900">
                  ℹ️ Cerco un passaggio dalla stazione all'evento (Last Mile)
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Campi specifici per Driver/Passenger */}
        {(outwardTrip.type === 'driver' || outwardTrip.type === 'passenger') && (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {outwardTrip.type === 'driver' ? 'Da dove parti?' : 'Dove sei?'}
              </label>
              <AddressAutocomplete
                value={outwardTrip.startLocation}
                onChange={(value) =>
                  setOutwardTrip({
                    ...outwardTrip,
                    startLocation: value,
                  })
                }
                placeholder="Indirizzo partenza"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-700">
                Destinazione: posizione evento.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Viaggio di Ritorno */}
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-3xl">🛬</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Viaggio di Ritorno</h2>
            <p className="text-sm text-slate-600">Come tornerai a casa?</p>
          </div>
        </div>

        {/* Selezione tipo */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold text-slate-700">Tipo di Trasporto</label>
          <TravelTypeSelector
            selectedType={returnTrip.type}
            onSelect={(type) =>
              setReturnTrip({
                ...EMPTY_TRIP,
                type,
              })
            }
          />
        </div>

        {/* Campo Read-Only: Partenza sempre dall'Evento */}
        {returnTrip.type && (
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-slate-700">📍 Partenza</label>
            <input
              type="text"
              disabled
              value="📍 Posizione dell'Evento"
              className="block w-full rounded-lg border border-slate-300 bg-slate-100 px-4 py-2.5 text-slate-500 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-slate-500 italic">
              Il ritorno parte sempre dal luogo dell'evento
            </p>
          </div>
        )}

        {/* Campi specifici per Transit */}
        {returnTrip.type === 'transit' && (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Stazione di Partenza (vicino all'evento)
              </label>
              <AddressAutocomplete
                value={returnTrip.startLocation}
                onChange={(value) =>
                  setReturnTrip({
                    ...returnTrip,
                    startLocation: value,
                  })
                }
                placeholder="Es. Stazione vicino all'evento"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Stazione di Arrivo (dove tornare a casa)
              </label>
              <AddressAutocomplete
                value={returnTrip.endLocation}
                onChange={(value) =>
                  setReturnTrip({
                    ...returnTrip,
                    endLocation: value,
                  })
                }
                placeholder="Es. Stazione Centrale Milano"
              />
            </div>
          </div>
        )}

        {/* Campi specifici per Driver/Passenger */}
        {(returnTrip.type === 'driver' || returnTrip.type === 'passenger') && (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Destinazione Finale
              </label>
              <AddressAutocomplete
                value={returnTrip.endLocation}
                onChange={(value) =>
                  setReturnTrip({
                    ...returnTrip,
                    endLocation: value,
                  })
                }
                placeholder="Indirizzo finale"
              />
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-slate-900 px-6 py-3 text-base font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? '⏳ Salvataggio in corso...' : '✓ Salva Preferenze'}
      </button>
    </section>
  )
}

export default TripPreferences
