"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { AlertCircle } from "lucide-react";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";

export default function HotspotMap({ alerts }: { alerts: any[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Fix Leaflet marker icons in Next.js
    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });
    });
  }, []);

  if (!mounted) return <div className="w-full h-full bg-slate-100 flex items-center justify-center">Loading map...</div>;

  const center: [number, number] = [12.9716, 77.5946]; // Default to Bangalore roughly

  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-slate-200">
      <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Placeholder rendering alerts around center as a demo since we don't have lat/long on alerts directly in schema, using random offset */}
        {alerts.map((alert, i) => (
          <CircleMarker
            key={alert.id}
            center={[center[0] + (i * 0.02 - 0.02), center[1] + (i * 0.03 - 0.03)]}
            pathOptions={{ color: alert.type === "HOTSPOT" ? "#E2A33D" : "#2E8F8F", fillColor: alert.type === "HOTSPOT" ? "#E2A33D" : "#2E8F8F", fillOpacity: 0.5 }}
            radius={alert.riskScore / 5} // Scale radius based on risk score
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-bold flex items-center gap-1"><AlertCircle className="w-4 h-4"/> {alert.zoneLabel}</h3>
                <p className="text-sm mt-1">{alert.reason}</p>
                <p className="text-xs font-bold mt-2">Risk Score: {alert.riskScore}/100</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
