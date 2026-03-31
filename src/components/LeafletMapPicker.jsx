import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'

const DEFAULT_CENTER = [45.4642, 9.19]

function ClickHandler({ onPick }) {
  useMapEvents({
    click(event) {
      onPick({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      })
    },
  })

  return null
}

function LeafletMapPicker({ location, onPick }) {
  const center = location ? [location.lat, location.lng] : DEFAULT_CENTER

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <MapContainer
        center={center}
        zoom={8}
        className="h-72 w-full sm:h-80"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={onPick} />
        {location ? <Marker position={[location.lat, location.lng]} /> : null}
      </MapContainer>
    </div>
  )
}

export default LeafletMapPicker
