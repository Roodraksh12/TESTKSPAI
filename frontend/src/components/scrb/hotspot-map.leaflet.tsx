"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { useTheme } from "next-themes";
import "leaflet/dist/leaflet.css";

export type HotspotCluster = {
  lat: number;
  lng: number;
  count: number;
  intensity: "high" | "medium" | "low";
  label: string;
  radius: number;
};

const BENGALURU_CENTRE: [number, number] = [12.9716, 77.5946];

const INTENSITY_COLOR: Record<HotspotCluster["intensity"], { fill: string; stroke: string }> = {
  high: { fill: "#ef4444", stroke: "#b91c1c" },
  medium: { fill: "#f59e0b", stroke: "#b45309" },
  low: { fill: "#14b8a6", stroke: "#0f766e" },
};

export default function HotspotMap({ clusters = [] }: { clusters?: HotspotCluster[] }) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="flex-1 w-full min-h-[16rem] animate-pulse rounded-2xl bg-surface-2" />;
  }

  const isDark = resolvedTheme === "dark";
  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  return (
    <div className="flex-1 w-full min-h-[16rem] overflow-hidden rounded-2xl border-none relative">
      <MapContainer
        center={BENGALURU_CENTRE}
        zoom={11}
        scrollWheelZoom
        style={{ height: "100%", width: "100%", position: "absolute", inset: 0 }}
      >
        <TileLayer
          url={tileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        {clusters.map((cluster, i) => {
          const colors = INTENSITY_COLOR[cluster.intensity] || INTENSITY_COLOR.low;
          return (
            <CircleMarker
              key={i}
              center={[cluster.lat, cluster.lng]}
              radius={Math.max(cluster.radius / 2.2, 8)}
              pathOptions={{ color: colors.stroke, fillColor: colors.fill, fillOpacity: 0.55, weight: 2 }}
            >
              <Popup>
                <div className="text-sm font-medium text-black">{cluster.label}</div>
                <div className="mt-1 text-xs capitalize text-gray-500">Intensity: {cluster.intensity}</div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {clusters.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center bg-surface/60 backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">No hotspot clusters in your jurisdiction yet.</p>
        </div>
      )}
    </div>
  );
}
