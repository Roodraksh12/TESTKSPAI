"use client";

import { useEffect, useState } from "react";
import { APIProvider, Map, Marker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { useTheme } from "next-themes";

const HOTSPOTS = [
  { id: 1, lat: 12.9716, lng: 77.5946, intensity: "high", radius: 40, label: "Central Hub (Vehicle Theft)" },
  { id: 2, lat: 12.9352, lng: 77.6245, intensity: "medium", radius: 30, label: "Koramangala (Burglary)" },
  { id: 3, lat: 12.9856, lng: 77.7378, intensity: "high", radius: 45, label: "Whitefield (Cyber Fraud)" },
  { id: 4, lat: 13.0068, lng: 77.5816, intensity: "low", radius: 20, label: "Malleswaram (Assault)" },
];

const DARK_MODE_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
];

const LIGHT_MODE_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e5e5e5" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ "color": "#757575" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "transit.line", "elementType": "geometry", stylers: [{ color: "#e5e5e5" }] },
  { featureType: "transit.station", "elementType": "geometry", "stylers": [{ color: "#eeeeee" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] }
];

export default function HotspotMap() {
  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();
  const [activeSpot, setActiveSpot] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="flex-1 w-full min-h-[16rem] animate-pulse rounded-2xl bg-surface-2" />;

  const isDark = theme === "dark";

  return (
    <div className="flex-1 w-full min-h-[16rem] overflow-hidden rounded-2xl border-none relative">
      <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}>
        <div className="absolute inset-0">
          <Map
          defaultCenter={{ lat: 12.9716, lng: 77.5946 }}
          defaultZoom={11}
          gestureHandling="greedy"
          disableDefaultUI={true}
          styles={isDark ? DARK_MODE_STYLE : LIGHT_MODE_STYLE}
        >
          {HOTSPOTS.map((spot) => {
            const size = spot.radius;
            const colorFill = spot.intensity === "high" ? "#ef4444" : spot.intensity === "medium" ? "#f59e0b" : "#14b8a6";
            const colorStroke = spot.intensity === "high" ? "#b91c1c" : spot.intensity === "medium" ? "#b45309" : "#0f766e";
            
            return (
              <Marker 
                key={spot.id} 
                position={{ lat: spot.lat, lng: spot.lng }}
                onClick={() => setActiveSpot(spot.id)}
                icon={{
                  path: 0, // google.maps.SymbolPath.CIRCLE
                  fillColor: colorFill,
                  fillOpacity: 0.5,
                  scale: size / 3,
                  strokeColor: colorStroke,
                  strokeWeight: 2,
                }}
              />
            );
          })}

          {activeSpot && (
            <InfoWindow
              position={{
                lat: HOTSPOTS.find(s => s.id === activeSpot)!.lat,
                lng: HOTSPOTS.find(s => s.id === activeSpot)!.lng
              }}
              onCloseClick={() => setActiveSpot(null)}
            >
              <div className="p-1 text-black">
                <div className="text-sm font-medium">{HOTSPOTS.find(s => s.id === activeSpot)?.label}</div>
                <div className="text-xs text-gray-500 mt-1 capitalize">Intensity: {HOTSPOTS.find(s => s.id === activeSpot)?.intensity}</div>
              </div>
            </InfoWindow>
          )}
        </Map>
        </div>
      </APIProvider>
    </div>
  );
}
