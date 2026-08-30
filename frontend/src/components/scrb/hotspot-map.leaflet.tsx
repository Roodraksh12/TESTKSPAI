"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { useTheme } from "next-themes";
import "leaflet/dist/leaflet.css";

export type HotspotCluster = {
  lat: number;
  lng: number;
  count: number;
  intensity: "high" | "medium" | "low";
  label: string;
  radius: number;
  riskScore?: number;
  stationId?: string;
  crimeType?: string;
  fingerprint?: string;
};

const BENGALURU_CENTRE: [number, number] = [12.9716, 77.5946];

const INTENSITY_COLOR: Record<HotspotCluster["intensity"], { fill: string; stroke: string }> = {
  high: { fill: "#ef4444", stroke: "#b91c1c" },
  medium: { fill: "#f59e0b", stroke: "#b45309" },
  low: { fill: "#14b8a6", stroke: "#0f766e" },
};

function FocusMap({ focus }: { focus: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo(focus, 15, { duration: 0.8 });
  }, [focus, map]);
  return null;
}

export default function HotspotMap({
  clusters = [],
  focus = null,
}: {
  clusters?: HotspotCluster[];
  focus?: [number, number] | null;
}) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="flex-1 w-full min-h-[16rem] animate-pulse rounded-2xl bg-surface-2" />;
  }

  const isDark = resolvedTheme === "dark";
  const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  return (
    <div className="flex-1 w-full min-h-[16rem] overflow-hidden rounded-2xl border-none relative">
      <MapContainer
        center={BENGALURU_CENTRE}
        zoom={11}
        scrollWheelZoom
        style={{ height: "100%", width: "100%", position: "absolute", inset: 0 }}
      >
        <FocusMap focus={focus} />
        <TileLayer
          url={tileUrl}
          className={isDark ? "invert-[100%] hue-rotate-180 brightness-[0.8] contrast-[1.2]" : ""}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {clusters.map((cluster, i) => {
          const colors = INTENSITY_COLOR[cluster.intensity] || INTENSITY_COLOR.low;
          const selected =
            focus &&
            Math.abs(cluster.lat - focus[0]) < 0.001 &&
            Math.abs(cluster.lng - focus[1]) < 0.001;
          return (
            <CircleMarker
              key={i}
              center={[cluster.lat, cluster.lng]}
              radius={Math.max(cluster.radius / 2.2, selected ? 12 : 8)}
              pathOptions={{
                color: selected ? "#ffffff" : colors.stroke,
                fillColor: colors.fill,
                fillOpacity: selected ? 0.8 : 0.55,
                weight: selected ? 4 : 2,
              }}
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
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center bg-surface/10">
          <div className="rounded-xl bg-surface/95 px-4 py-2.5 shadow-sm border border-hairline backdrop-blur-md">
            <p className="text-sm font-medium text-foreground">No hotspot clusters in your jurisdiction yet.</p>
          </div>
        </div>
      )}
    </div>
  );
}
