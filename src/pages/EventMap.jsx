import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, Polyline } from 'react-leaflet'
import { useAuth } from '../context/useAuth'
import { db } from '../firebase'

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const toLatLng = (location) => {
  if (!location) return null
  const lat = toNumber(location.lat)
  const lng = toNumber(location.lng)
  if (lat === null || lng === null) return null
  return [lat, lng]
}

function EventMap() {
  const { eventId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentUser } = useAuth()

  const selectedFlow = searchParams.get('flow') || 'outward'

  const handleFlowChange = (flow) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('flow', flow)
    setSearchParams(nextParams)
  }

  const [eventData, setEventData] = useState(null)
  const [participants, setParticipants] = useState([])
  const [driverRoute, setDriverRoute] = useState([])
  const [isRouting, setIsRouting] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPassengers, setSelectedPassengers] = useState([])

  const currentDriverTrip = participants.find((p) => p.userId === currentUser?.uid)?.[
    selectedFlow === 'outward' ? 'outwardTrip' : 'returnTrip'
  ]

  const isCurrentUserDriver = currentDriverTrip?.type === 'driver'

  // Carica event, participants e dati driver salvati
  useEffect(() => {
    const loadData = async () => {
      if (!eventId || !currentUser) return

      try {
        setLoading(true)
        setError('')

        // Carica evento
        const eventRef = doc(db, 'events', eventId)
        const eventSnap = await getDoc(eventRef)
        if (!eventSnap.exists()) {
          setError('Evento non trovato.')
          return
        }
        setEventData({ id: eventSnap.id, ...eventSnap.data() })

        // Carica tutti i participants
        const participantsQuery = query(
          collection(db, 'participants'),
          where('eventId', '==', eventId),
        )
        const participantsSnap = await getDocs(participantsQuery)
        const participantsData = participantsSnap.docs.map((doc) => ({
          ...doc.data(),
          participantDocId: doc.id,
        }))
        setParticipants(participantsData)

        // Se il driver ha già passeggeri salvati, caricali
        const currentParticipant = participantsData.find((p) => p.userId === currentUser.uid)
        if (currentParticipant) {
          const currentTrip =
            currentParticipant[selectedFlow === 'outward' ? 'outwardTrip' : 'returnTrip']
          if (currentTrip?.type === 'driver' && currentTrip.passengers?.length > 0) {
            // Carica mappatura passeggeri con loro dati
            const passengersWithData = []
            for (const passengerId of currentTrip.passengers) {
              const passengerParticipant = participantsData.find((p) => p.userId === passengerId)
              if (passengerParticipant) {
                const passengerTrip =
                  passengerParticipant[
                    selectedFlow === 'outward' ? 'outwardTrip' : 'returnTrip'
                  ]
                const passengerLocation =
                  passengerTrip?.type === 'transit'
                    ? passengerTrip?.startLocation
                    : selectedFlow === 'outward'
                      ? passengerTrip?.startLocation
                      : passengerTrip?.endLocation

                if (toLatLng(passengerLocation)) {
                  passengersWithData.push({
                    id: passengerId,
                    name:
                      passengerParticipant.userName ||
                      passengerParticipant.userEmail ||
                      'Utente Sconosciuto',
                    location: passengerLocation,
                  })
                }
              }
            }
            setSelectedPassengers(passengersWithData)
          }
        }
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Impossibile caricare i dati della mappa.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [eventId, currentUser, selectedFlow])

  const eventPoint = useMemo(() => {
    if (!eventData) return null

    // Helper per estrarre le coordinate in modo sicuro
    if (eventData.location) {
      const lat = toNumber(eventData.location.lat)
      const lng = toNumber(eventData.location.lng)
      if (lat !== null && lng !== null) {
        return [lat, lng]
      }
    }

    const latitude = toNumber(eventData.latitude ?? eventData.lat)
    const longitude = toNumber(eventData.longitude ?? eventData.lng)
    if (latitude !== null && longitude !== null) {
      return [latitude, longitude]
    }

    return null
  }, [eventData])

  const driverRouteEndpoint = useMemo(() => {
    if (selectedFlow === 'outward') {
      return toLatLng(currentDriverTrip?.startLocation)
    }
    return toLatLng(currentDriverTrip?.endLocation)
  }, [currentDriverTrip, selectedFlow])

  // Estrai waypoint coordinates dei passeggeri selezionati
  const routeWaypointPoints = useMemo(
    () =>
      selectedPassengers
        .map((p) => toLatLng(p.location))
        .filter(Boolean),
    [selectedPassengers],
  )

  // Coordinati OSRM string (unica dipendenza dell'effetto)
  const routeCoordinatesString = useMemo(() => {
    if (!isCurrentUserDriver || !eventPoint || !driverRouteEndpoint) return null

    const routePoints =
      selectedFlow === 'outward'
        ? [driverRouteEndpoint, ...routeWaypointPoints, eventPoint]
        : [eventPoint, ...routeWaypointPoints, driverRouteEndpoint]

    if (routePoints.length < 2) return null

    return routePoints.map(([lat, lng]) => `${lng},${lat}`).join(';')
  }, [selectedFlow, isCurrentUserDriver, eventPoint, driverRouteEndpoint, routeWaypointPoints])

  // Fallback line se OSRM fallisce
  const fallbackLine = useMemo(() => {
    if (!routeCoordinatesString) return []
    const coords = routeCoordinatesString.split(';').map((pair) => {
      const [lng, lat] = pair.split(',').map(Number)
      return [lat, lng]
    })
    return coords.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
  }, [routeCoordinatesString])

  // Fetch OSRM route - SINGLE DEPENDENCY: routeCoordinatesString
  useEffect(() => {
    if (!routeCoordinatesString) {
      setDriverRoute([])
      setRouteError('')
      setIsRouting(false)
      return
    }

    let isMounted = true
    setIsRouting(true)

    const fetchRoute = async () => {
      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${routeCoordinatesString}?overview=full&geometries=geojson`,
        )
        if (!response.ok) throw new Error('OSRM API error')

        const data = await response.json()
        if (isMounted && data.routes?.[0]) {
          const latLngs = data.routes[0].geometry.coordinates
            .map((coord) => [coord[1], coord[0]]) // [lng,lat] → [lat,lng]
            .filter(Boolean)
          if (latLngs.length > 1) {
            setDriverRoute(latLngs)
            setRouteError('')
          }
        }
      } catch (err) {
        console.error('Routing error:', err)
        if (isMounted) {
          setDriverRoute(fallbackLine)
          setRouteError('Rotta stimata in fallback (OSRM non disponibile).')
        }
      } finally {
        if (isMounted) setIsRouting(false) // GUARANTEED SHUTDOWN
      }
    }

    fetchRoute()
    return () => {
      isMounted = false
    }
  }, [routeCoordinatesString, fallbackLine]) // fallbackLine per completezza

  // Gestisci aggiunta passeggero
  const handleAddPassenger = (passengerId, passengerData) => {
    if (selectedPassengers.some((p) => p.id === passengerId)) {
      setSelectedPassengers(selectedPassengers.filter((p) => p.id !== passengerId))
    } else {
      setSelectedPassengers([...selectedPassengers, { id: passengerId, ...passengerData }])
    }
  }

  // Salva il percorso del driver con passengers e waypoints sul database
  const handleSaveRoute = async () => {
    if (!currentParticipant) return

    try {
      const tripKey = selectedFlow === 'outward' ? 'outwardTrip' : 'returnTrip'

      // Mappa i selected passengers per estrarre ID e waypoints
      const passengersIds = selectedPassengers.map((p) => p.id)
      const waypoints = selectedPassengers
        .map((p) => {
          const point = toLatLng(p.location)
          if (!point) return null
          return {
            address: p.location?.address || p.name || '',
            lat: point[0],
            lng: point[1],
          }
        })
        .filter(Boolean)

      // Usa updateDoc con notazione del punto per aggiornare solo questi campi
      const participantRef = doc(db, 'participants', currentParticipant.participantDocId)
      await updateDoc(participantRef, {
        [`${tripKey}.passengers`]: passengersIds,
        [`${tripKey}.waypoints`]: waypoints,
      })

      alert('Percorso salvato con successo!')
    } catch (err) {
      console.error('Error saving route:', err)
      alert('Errore nel salvataggio del percorso.')
    }
  }

  const getParticipantName = (participant) => {
    return participant.userName || participant.userEmail?.split('@')[0] || 'Utente Sconosciuto'
  }

  const currentParticipant = participants.find((p) => p.userId === currentUser?.uid)

  if (loading)
    return (
      <section className="flex items-center justify-center py-16">
        <p className="text-slate-600">Caricamento mappa...</p>
      </section>
    )

  if (error)
    return (
      <section className="mx-auto max-w-4xl">
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</p>
      </section>
    )

  if (!eventData || !eventPoint)
    return (
      <section className="mx-auto max-w-4xl">
        <p className="text-slate-600">Evento non trovato.</p>
      </section>
    )

  // Filtra passeggeri e transit per il flusso selezionato
  const passengerMarkers = participants
    .filter((p) => {
      const trip = p[selectedFlow === 'outward' ? 'outwardTrip' : 'returnTrip']
      const markerLocation =
        selectedFlow === 'outward' ? trip?.startLocation : trip?.endLocation
      return trip?.type === 'passenger' && toLatLng(markerLocation)
    })
    .map((p) => {
      const trip = p[selectedFlow === 'outward' ? 'outwardTrip' : 'returnTrip']
      const markerLocation =
        selectedFlow === 'outward' ? trip?.startLocation : trip?.endLocation
      return {
        participantId: p.participantDocId,
        userId: p.userId,
        name: getParticipantName(p),
        location: markerLocation,
        trip,
      }
    })

  const transitMarkers = participants
    .filter((p) => {
      const trip = p[selectedFlow === 'outward' ? 'outwardTrip' : 'returnTrip']
      return trip?.type === 'transit' && toLatLng(trip?.startLocation)
    })
    .map((p) => {
      const trip = p[selectedFlow === 'outward' ? 'outwardTrip' : 'returnTrip']
      return {
        participantId: p.participantDocId,
        userId: p.userId,
        name: getParticipantName(p),
        location: trip.startLocation,
        trip,
      }
    })

  const driverMarkers = participants
    .filter((p) => {
      const trip = p[selectedFlow === 'outward' ? 'outwardTrip' : 'returnTrip']
      const markerLocation =
        selectedFlow === 'outward' ? trip?.startLocation : trip?.endLocation
      return trip?.type === 'driver' && toLatLng(markerLocation)
    })
    .map((p) => {
      const trip = p[selectedFlow === 'outward' ? 'outwardTrip' : 'returnTrip']
      const markerLocation =
        selectedFlow === 'outward' ? trip?.startLocation : trip?.endLocation
      return {
        participantId: p.participantDocId,
        userId: p.userId,
        name: getParticipantName(p),
        location: markerLocation,
        trip,
      }
    })

  return (
    <section className="mx-auto flex h-screen w-full max-w-7xl flex-col gap-4 p-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Evento</p>
            <h1 className="text-xl font-semibold text-slate-900">{eventData.name}</h1>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => handleFlowChange('outward')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  selectedFlow === 'outward'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                Viaggio di andata
              </button>
              <button
                type="button"
                onClick={() => handleFlowChange('return')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  selectedFlow === 'return'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                Viaggio di ritorno
              </button>
            </div>

            <Link
              to={`/event/${eventId}/preferences`}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Preferenze viaggio
            </Link>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <MapContainer
          center={eventPoint}
          zoom={12}
          style={{ height: '100%' }}
          scrollWheelZoom
          touchZoom
        >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        {/* Event marker */}
        <Marker
          position={eventPoint}
          icon={L.divIcon({
            className: 'custom-marker',
            html: '<div style="width: 24px; height: 24px; background-color: red; border-radius: 50%; border: 2px solid white;"></div>',
            iconSize: [24, 24],
          })}
        >
          <Popup>
            <div>
              <p className="font-semibold">{eventData.name}</p>
              <p className="text-sm text-slate-600">Evento</p>
            </div>
          </Popup>
        </Marker>

        {/* Driver markers */}
        {driverMarkers.map((driver) => (
          (() => {
            const markerPosition = toLatLng(driver.location)
            if (!markerPosition) return null
            return (
          <Marker
            key={driver.participantId}
            position={markerPosition}
            icon={L.divIcon({
              className: 'custom-marker',
              html: '<div style="width: 24px; height: 24px; background-color: green; border-radius: 50%; border: 2px solid white;"></div>',
              iconSize: [24, 24],
            })}
          >
            <Popup>
              <div>
                <p className="font-semibold">{driver.name}</p>
                <p className="text-sm text-slate-600">Driver</p>
              </div>
            </Popup>
          </Marker>
            )
          })()
        ))}

        {/* Passenger markers */}
        {passengerMarkers.map((passenger) => (
          (() => {
            const markerPosition = toLatLng(passenger.location)
            if (!markerPosition) return null
            return (
          <Marker
            key={passenger.participantId}
            position={markerPosition}
            icon={L.divIcon({
              className: 'custom-marker',
              html: '<div style="width: 24px; height: 24px; background-color: orange; border-radius: 50%; border: 2px solid white;"></div>',
              iconSize: [24, 24],
            })}
          >
            <Popup>
              <div>
                <p className="font-semibold">{passenger.name}</p>
                <p className="text-sm text-slate-600">Passeggero</p>
                {isCurrentUserDriver && (
                  <button
                    onClick={() =>
                      handleAddPassenger(passenger.userId, {
                        name: passenger.name,
                        location: passenger.location,
                      })
                    }
                    className="mt-2 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                  >
                    {selectedPassengers.some((p) => p.id === passenger.userId)
                      ? 'Rimosso'
                      : 'Aggiungi'}
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
            )
          })()
        ))}

        {/* Transit markers */}
        {transitMarkers.map((transit) => (
          (() => {
            const markerPosition = toLatLng(transit.location)
            if (!markerPosition) return null
            return (
          <Marker
            key={transit.participantId}
            position={markerPosition}
            icon={L.divIcon({
              className: 'custom-marker',
              html: '<div style="width: 24px; height: 24px; background-color: blue; border-radius: 50%; border: 2px solid white;"></div>',
              iconSize: [24, 24],
            })}
          >
            <Popup>
              <div>
                <p className="font-semibold">{transit.name}</p>
                <p className="text-sm text-slate-600">Trasporto Pubblico</p>
                {isCurrentUserDriver && (
                  <button
                    onClick={() =>
                      handleAddPassenger(transit.userId, {
                        name: transit.name,
                        location: transit.location,
                      })
                    }
                    className="mt-2 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                  >
                    {selectedPassengers.some((p) => p.id === transit.userId)
                      ? 'Rimosso'
                      : 'Aggiungi Tappa'}
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
            )
          })()
        ))}

        {/* Driver route polyline */}
        {isCurrentUserDriver && driverRoute.length > 0 && (
          <Polyline positions={driverRoute} color="blue" weight={3} opacity={0.7} />
        )}

        {/* Transit lines (straight dashed) */}
        {transitMarkers.map((transit) => (
          (() => {
            const transitPoint = toLatLng(transit.location)
            if (!transitPoint || !eventPoint) return null
            return (
          <Polyline
            key={`transit-${transit.participantId}`}
            positions={[
              transitPoint,
              eventPoint,
            ]}
            color="blue"
            weight={2}
            dashArray="5, 5"
            opacity={0.5}
          />
            )
          })()
        ))}
        </MapContainer>

        {/* Driver control panel */}
        {isCurrentUserDriver && (
          <div className="absolute right-4 top-4 z-1000 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <h3 className="font-semibold text-slate-900">Passeggeri Selezionati</h3>
          {selectedPassengers.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Nessun passeggero selezionato.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {selectedPassengers.map((passenger) => (
                <li key={passenger.id} className="flex items-center justify-between rounded bg-slate-50 p-2">
                  <span className="text-sm font-medium text-slate-900">{passenger.name}</span>
                  <button
                    onClick={() =>
                      setSelectedPassengers(selectedPassengers.filter((p) => p.id !== passenger.id))
                    }
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Rimuovi
                  </button>
                </li>
              ))}
            </ul>
          )}

          {isRouting && (
            <p className="mt-4 text-sm text-blue-600">Calcolo rotta in corso...</p>
          )}

          {routeError && <p className="mt-4 text-sm text-orange-600">{routeError}</p>}

          <button
            onClick={handleSaveRoute}
            disabled={isRouting}
            className="mt-4 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            Salva Percorso
          </button>
          </div>
        )}
      </div>
    </section>
  )
}

export default EventMap
