"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

import {
  channelMapColors,
  channelStyles,
  type SalesChannel,
} from "@/lib/orders/channel";
import type { OrderMapMarker } from "@/lib/orders/map-markers";

const UK_CENTER: L.LatLngExpression = [54.5, -2.5];
const DEFAULT_ZOOM = 6;

function createChannelIcon(channel: SalesChannel) {
  const color = channelMapColors[channel];

  return L.divIcon({
    className: "order-map-marker",
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function buildPopupHtml(marker: OrderMapMarker, rangeQuery?: string): string {
  const location = marker.region ?? marker.city ?? "Unknown area";
  const buyer = marker.buyerName ?? "Unknown buyer";
  const orderHref = rangeQuery
    ? `/orders/${marker.shopifyId}?range=${encodeURIComponent(rangeQuery)}`
    : `/orders/${marker.shopifyId}`;

  return `
    <div class="order-map-popup">
      <p class="order-map-popup__title">${marker.orderNumber}</p>
      <p class="order-map-popup__meta">${buyer}</p>
      <p class="order-map-popup__meta">${location}</p>
      <p class="order-map-popup__revenue">${marker.revenueLabel}</p>
      <a class="order-map-popup__link" href="${orderHref}">View order →</a>
    </div>
  `;
}

function MarkerClusterLayer({
  markers,
  rangeQuery,
}: {
  markers: OrderMapMarker[];
  rangeQuery?: string;
}) {
  const map = useMap();

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
    });

    for (const marker of markers) {
      const leafletMarker = L.marker([marker.latitude, marker.longitude], {
        icon: createChannelIcon(marker.channel),
      });
      leafletMarker.bindPopup(buildPopupHtml(marker, rangeQuery), {
        maxWidth: 260,
        minWidth: 180,
      });
      cluster.addLayer(leafletMarker);
    }

    map.addLayer(cluster);

    if (markers.length === 1) {
      map.setView([markers[0].latitude, markers[0].longitude], 11);
    } else if (markers.length > 1) {
      const bounds = L.latLngBounds(
        markers.map((marker) => [marker.latitude, marker.longitude]),
      );
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
    }

    return () => {
      map.removeLayer(cluster);
    };
  }, [map, markers, rangeQuery]);

  return null;
}

type OrdersMapProps = {
  markers: OrderMapMarker[];
  rangeQuery?: string;
};

export function OrdersMap({ markers, rangeQuery }: OrdersMapProps) {
  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-xl border border-border/60">
      <MapContainer
        center={UK_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MarkerClusterLayer markers={markers} rangeQuery={rangeQuery} />
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-border/60 bg-background/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Channel
        </p>
        <ul className="space-y-1.5">
          {(["Amazon", "eBay", "Temu", "Other"] as SalesChannel[]).map(
            (channel) => (
              <li
                key={channel}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <span
                  className="size-3 shrink-0 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: channelMapColors[channel] }}
                />
                {channelStyles[channel].label}
              </li>
            ),
          )}
        </ul>
      </div>
    </div>
  );
}
