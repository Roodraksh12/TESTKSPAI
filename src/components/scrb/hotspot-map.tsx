"use client"

import { useEffect, useState } from "react"
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"

// Fix for default marker icons not showing in leaflet/webpack
import L from "leaflet"
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
})

const HOTSPOTS = [
  { id: 1, lat: 12.9716, lng: 77.5946, intensity: "high", radius: 40, label: "Central Hub (Vehicle Theft)" },
  { id: 2, lat: 12.9352, lng: 77.6245, intensity: "medium", radius: 30, label: "Koramangala (Burglary)" },
  { id: 3, lat: 12.9856, lng: 77.7378, intensity: "high", radius: 45, label: "Whitefield (Cyber Fraud)" },
  { id: 4, lat: 13.0068, lng: 77.5816, intensity: "low", radius: 20, label: "Malleswaram (Assault)" },
]

function MapUpdater() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [map])
  return null
}

export default function HotspotMap() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <div className="h-64 w-full animate-pulse rounded-2xl bg-surface-2" />

  return (
    <div className="h-64 w-full overflow-hidden rounded-2xl border border-hairline">
      <MapContainer
        center={[12.9716, 77.5946]}
        zoom={11}
        scrollWheelZoom={false}
        className="h-full w-full z-0"
        style={{ zIndex: 0 }}
      >
        <MapUpdater />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {HOTSPOTS.map((spot) => (
          <CircleMarker
            key={spot.id}
            center={[spot.lat, spot.lng]}
            radius={spot.radius / 2}
            pathOptions={{
              fillColor: spot.intensity === "high" ? "#DC2626" : spot.intensity === "medium" ? "#D97706" : "#0D9488",
              color: spot.intensity === "high" ? "#991B1B" : spot.intensity === "medium" ? "#B45309" : "#0F766E",
              weight: 2,
              fillOpacity: 0.4,
            }}
          >
            <Popup>
              <div className="text-sm font-medium">{spot.label}</div>
              <div className="text-xs text-muted-foreground mt-1 text-capitalize">Intensity: {spot.intensity}</div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
