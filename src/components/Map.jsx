// src/components/Map.jsx
import { useEffect, useState, useRef } from "react";
import { MapContainer, GeoJSON, Marker } from "react-leaflet";
import { DivIcon } from "leaflet";
import "leaflet/dist/leaflet.css";

export default function Map() {
  const [geoJsonData, setGeoJsonData] = useState({ trench: null, text: null, trenchLine: null });
  const visibleLayersRef = useRef({});
  const mapRef = useRef(null);

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

    // Load TRENCH-LINE.geojson
    fetch("/TRENCH-LINE.geojson")
      .then((res) => res.json())
      .then((data) => {
        setGeoJsonData(prev => ({ ...prev, trenchLine: data }));
      })
      .catch((err) => {
        console.warn('Failed to load TRENCH-LINE.geojson:', err);
      });
  }, []);

  const onEachFeature = (feature, layer) => {
    if (feature.properties && feature.properties.text) {
      layer.bindPopup(feature.properties.text);
    }
  };

  const onEachTrenchLineFeature = (feature, layer) => {
    if (feature.properties && feature.properties.layer === "Base Zanjas MT_CIVIL_H$0$C-STRM-CNTR") {
      const key = feature.properties.fid ?? feature.properties.handle ?? JSON.stringify(feature.geometry);
      visibleLayersRef.current[key] = layer;
    }
  };

  const onEachTrenchLineHoverFeature = (feature, layer) => {
    if (feature.properties && feature.properties.layer === "Base Zanjas MT_CIVIL_H$0$C-STRM-CNTR") {
      const key = feature.properties.fid ?? feature.properties.handle ?? JSON.stringify(feature.geometry);
      layer.on({
        mouseover: () => {
          const target = visibleLayersRef.current[key];
          console.log('hover overlay mouseover', key, !!target);
          if (target) {
            try {
              const base = style(target.feature) || { weight: 2 };
              const hoverWeight = Math.max(Math.round(base.weight * 3), 6);
              target.setStyle({ color: '#00ff00', weight: hoverWeight, opacity: 1 });
            } catch (err) {
              target.setStyle({ color: '#00ff00' });
            }
          }
        },
        mouseout: () => {
          const target = visibleLayersRef.current[key];
          if (target) target.setStyle(style(feature));
        }
      });
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

  // Attach a mousemove handler to the real Leaflet map instance so we
  // can compute proximity to trench-line layers. Use whenCreated on
  // MapContainer to populate mapRef.current (below) and add/remove
  // the listener here. This does not change base styles permanently;
  // it only temporarily changes the color when cursor is near.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e) => {
      const mouseLatLng = e.latlng;
      const layers = Object.values(visibleLayersRef.current || {});
      layers.forEach((layer) => {
        try {
          const latlngs = layer.getLatLngs();
          // flatten nested arrays (MultiLineString may be nested)
          const points = Array.isArray(latlngs) ? latlngs.flat(Infinity) : [latlngs];
          let minDistance = Infinity;
          points.forEach((pt) => {
            // some points may still be arrays; guard against that
            if (!pt || typeof pt.lat !== 'number') return;
            const d = map.distance(mouseLatLng, pt);
            if (d < minDistance) minDistance = d;
          });

          const THRESHOLD = 60; // meters — adjust sensitivity here (increased 3x)
          if (minDistance <= THRESHOLD) {
            try {
              const base = style(layer.feature) || { weight: 2 };
              const hoverWeight = Math.max(Math.round(base.weight * 3), 6);
              layer.setStyle({ color: '#00ff00', weight: hoverWeight, opacity: 1 });
            } catch (err) {
              layer.setStyle({ color: '#00ff00' });
            }
          } else {
            layer.setStyle(style(layer.feature));
          }
        } catch (err) {
          // ignore layers we can't inspect
        }
      });
    };

    map.on('mousemove', handler);
    return () => {
      map.off('mousemove', handler);
    };
  }, [geoJsonData.trenchLine]);

  const hoverStyle = (feature) => ({ color: '#000000', weight: 60, opacity: 0, fill: false, interactive: true });

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <MapContainer
        whenCreated={(map) => { mapRef.current = map; }}
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
        {geoJsonData.trenchLine && (
          <>
            <GeoJSON
              data={geoJsonData.trenchLine}
              style={style}
              onEachFeature={onEachTrenchLineFeature}
            />
            <GeoJSON
              data={geoJsonData.trenchLine}
              style={hoverStyle}
              onEachFeature={onEachTrenchLineHoverFeature}
            />
          </>
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
