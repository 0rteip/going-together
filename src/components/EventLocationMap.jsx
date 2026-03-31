import { MapContainer, Marker, TileLayer } from 'react-leaflet'

function EventLocationMap({ location }) {
  if (!location) {
    return null
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <MapContainer
        center={[location.lat, location.lng]}
        zoom={10}
        className="h-64 w-full sm:h-72"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[location.lat, location.lng]} />
      </MapContainer>
    </div>
  )
}

export default EventLocationMap
