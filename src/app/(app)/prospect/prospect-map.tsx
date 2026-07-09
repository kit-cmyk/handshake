"use client";

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/places/provider";

export type MapHit = {
  name: string;
  rating: number | null;
  address: string | null;
  lat: number;
  lng: number;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Plots prospected businesses on an OpenStreetMap tile layer, with a circle for
 * the search radius. Rendered client-only (via next/dynamic) since Leaflet
 * touches `window`. Uses vector circleMarkers to avoid marker-image assets.
 */
export default function ProspectMap({
  center,
  radiusMeters,
  hits,
}: {
  center: LatLng | null;
  radiusMeters: number | null;
  hits: MapHit[];
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const layerRef = React.useRef<L.LayerGroup | null>(null);

  // Initialize the map once.
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
    }).setView([39.5, -98.35], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redraw the radius + pins whenever the results change.
  React.useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const points: L.LatLngExpression[] = [];

    if (center && radiusMeters) {
      L.circle([center.lat, center.lng], {
        radius: radiusMeters,
        color: "#6366f1",
        weight: 1,
        fillColor: "#6366f1",
        fillOpacity: 0.08,
      }).addTo(layer);
    }

    for (const h of hits) {
      L.circleMarker([h.lat, h.lng], {
        radius: 6,
        color: "#4f46e5",
        weight: 1,
        fillColor: "#6366f1",
        fillOpacity: 0.9,
      })
        .bindPopup(
          `<strong>${escapeHtml(h.name)}</strong>` +
            (h.rating != null ? `<br/>★ ${h.rating}` : "") +
            (h.address ? `<br/>${escapeHtml(h.address)}` : "")
        )
        .addTo(layer);
      points.push([h.lat, h.lng]);
    }
    if (center) points.push([center.lat, center.lng]);

    if (points.length) {
      map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 14 });
    }
    // The container often appears (post-search) after the map was created.
    setTimeout(() => map.invalidateSize(), 0);
  }, [center, radiusMeters, hits]);

  return <div ref={containerRef} className="h-80 w-full rounded-lg border" />;
}
