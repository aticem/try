// src/components/Map.jsx
import { useEffect, useState } from "react";
import { MapContainer, GeoJSON, Marker } from "react-leaflet";
import { DivIcon } from "leaflet";
import "leaflet/dist/leaflet.css";

export default function Map() {
  const [geoJsonData, setGeoJsonData] = useState({ trench: null, text: null });

  useEffect(() => {
    // Load trench.geojson
    fetch("/trench.geojson")
      .then((res) => res.json())
      .then((data) => {
        setGeoJsonData(prev => ({ ...prev, trench: data }));
      })
      .catch((err) => {
        console.warn('Failed to load trench.geojson:', err);
      });

    // Load text.geojson
    fetch("/text.geojson")
      .then((res) => res.json())
      .then((data) => {
        setGeoJsonData(prev => ({ ...prev, text: data }));
      })
      .catch((err) => {
        console.warn('Failed to load text.geojson:', err);
      });
  }, []);

  const onEachFeature = (feature, layer) => {
    if (feature.properties && feature.properties.text) {
      layer.bindPopup(feature.properties.text);
    }
  };

  const style = (feature) => {
    if (feature.properties && feature.properties.color) {
      const colorMatch = feature.properties.color.match(/(\d+),(\d+),(\d+),\d+/);
      if (colorMatch) {
        return {
          color: `rgb(${colorMatch[1]},${colorMatch[2]},${colorMatch[3]})`,
          weight: 2,
          opacity: 1
        };
      }
    }
    return { color: 'blue', weight: 2, opacity: 1 };
  };

  const createTextIcon = (text) => {
    return new DivIcon({
      html: `<div style="font-size: 12px; font-weight: bold; color: black; background: rgba(255,255,255,0.8); padding: 2px 4px; border-radius: 3px; border: 1px solid #333; white-space: nowrap;">${text}</div>`,
      className: 'custom-text-icon',
      iconSize: [text.length * 8, 20],
      iconAnchor: [text.length * 4, 10]
    });
  };

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <MapContainer
        center={[52.685, -1.669]}
        zoom={18}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        {geoJsonData.trench && (
          <GeoJSON
            data={geoJsonData.trench}
            style={style}
            onEachFeature={onEachFeature}
          />
        )}
        {geoJsonData.text && geoJsonData.text.features.map((feature, index) => {
          if (feature.geometry.type === 'Point' && feature.properties.text) {
            const [lng, lat] = feature.geometry.coordinates;
            return (
              <Marker
                key={index}
                position={[lat, lng]}
                icon={createTextIcon(feature.properties.text)}
              />
            );
          }
          return null;
        })}
      </MapContainer>
    </div>
  );
}
