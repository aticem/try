// src/components/Map.jsx
import { useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, GeoJSON, Marker, useMapEvents } from "react-leaflet";
import { DivIcon } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Helper function to calculate distance between two coordinates in meters (Haversine formula)
const calculateDistance = (coord1, coord2) => {
  const R = 6371000; // Earth's radius in meters
  const lat1 = coord1[1] * Math.PI / 180;
  const lat2 = coord2[1] * Math.PI / 180;
  const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
  const deltaLng = (coord2[0] - coord1[0]) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// Calculate length of a LineString feature in meters
const calculateLineLength = (coordinates) => {
  let totalLength = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    totalLength += calculateDistance(coordinates[i], coordinates[i + 1]);
  }
  return totalLength;
};

// Check if a point is inside bounds
const isPointInBounds = (coord, bounds) => {
  const lat = coord[1];
  const lng = coord[0];
  return lat >= bounds.getSouth() && lat <= bounds.getNorth() &&
         lng >= bounds.getWest() && lng <= bounds.getEast();
};

// Clip a line segment to bounds and return only the part inside
const clipLineToBounds = (coord1, coord2, bounds) => {
  const x1 = coord1[0], y1 = coord1[1];
  const x2 = coord2[0], y2 = coord2[1];
  
  const xmin = bounds.west, xmax = bounds.east;
  const ymin = bounds.south, ymax = bounds.north;
  
  // Cohen-Sutherland algorithm helpers
  const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;
  
  const computeCode = (x, y) => {
    let code = INSIDE;
    if (x < xmin) code |= LEFT;
    else if (x > xmax) code |= RIGHT;
    if (y < ymin) code |= BOTTOM;
    else if (y > ymax) code |= TOP;
    return code;
  };
  
  let code1 = computeCode(x1, y1);
  let code2 = computeCode(x2, y2);
  let accept = false;
  let cx1 = x1, cy1 = y1, cx2 = x2, cy2 = y2;
  
  while (true) {
    if (!(code1 | code2)) {
      // Both inside
      accept = true;
      break;
    } else if (code1 & code2) {
      // Both outside same region
      break;
    } else {
      // Line crosses boundary
      let x, y;
      const codeOut = code1 ? code1 : code2;
      
      if (codeOut & TOP) {
        x = cx1 + (cx2 - cx1) * (ymax - cy1) / (cy2 - cy1);
        y = ymax;
      } else if (codeOut & BOTTOM) {
        x = cx1 + (cx2 - cx1) * (ymin - cy1) / (cy2 - cy1);
        y = ymin;
      } else if (codeOut & RIGHT) {
        y = cy1 + (cy2 - cy1) * (xmax - cx1) / (cx2 - cx1);
        x = xmax;
      } else if (codeOut & LEFT) {
        y = cy1 + (cy2 - cy1) * (xmin - cx1) / (cx2 - cx1);
        x = xmin;
      }
      
      if (codeOut === code1) {
        cx1 = x;
        cy1 = y;
        code1 = computeCode(cx1, cy1);
      } else {
        cx2 = x;
        cy2 = y;
        code2 = computeCode(cx2, cy2);
      }
    }
  }
  
  if (accept) {
    return [[cx1, cy1], [cx2, cy2]];
  }
  return null;
};

// Calculate the length of line segments that are inside the bounds (precise clipping)
const calculateLengthInsideBounds = (coordinates, bounds) => {
  let lengthInside = 0;
  
  const boundsObj = {
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast()
  };
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const coord1 = coordinates[i];
    const coord2 = coordinates[i + 1];
    
    // Clip line to bounds
    const clipped = clipLineToBounds(coord1, coord2, boundsObj);
    
    if (clipped) {
      // Calculate the length of the clipped segment
      lengthInside += calculateDistance(clipped[0], clipped[1]);
    }
  }
  
  return lengthInside;
};

// Check if a line segment intersects with a bounding box
const lineIntersectsBounds = (coordinates, bounds) => {
  // Check if any point of the line is inside the bounds
  for (const coord of coordinates) {
    if (isPointInBounds(coord, bounds)) {
      return true;
    }
  }
  return false;
};

// Selection Box Component
function SelectionBox({ onSelectionComplete, visibleLayersRef, geoJsonData, setSelectedBounds }) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [currentPoint, setCurrentPoint] = useState(null);
  const selectionRectRef = useRef(null);

  const map = useMapEvents({
    mousedown: (e) => {
      // Only start selection on left mouse button
      if (e.originalEvent.button === 0) {
        setIsSelecting(true);
        setStartPoint(e.latlng);
        setCurrentPoint(e.latlng);
        
        // Disable map dragging during selection
        map.dragging.disable();
      }
    },
    mousemove: (e) => {
      if (isSelecting && startPoint) {
        setCurrentPoint(e.latlng);
        
        // Update or create selection rectangle
        const bounds = L.latLngBounds(startPoint, e.latlng);
        if (selectionRectRef.current) {
          selectionRectRef.current.setBounds(bounds);
        } else {
          selectionRectRef.current = L.rectangle(bounds, {
            color: '#0066ff',
            weight: 2,
            fillColor: '#0066ff',
            fillOpacity: 0.2,
            dashArray: '5, 5'
          }).addTo(map);
        }
      }
    },
    mouseup: (e) => {
      if (isSelecting && startPoint) {
        const bounds = L.latLngBounds(startPoint, e.latlng);
        
        // Calculate total length inside the selection box
        let totalLengthInside = 0;
        
        if (geoJsonData.trenchLine) {
          geoJsonData.trenchLine.features.forEach((feature, index) => {
            if (feature.properties && feature.properties.layer === "Base Zanjas MT_CIVIL_H$0$C-STRM-CNTR") {
              const lengthInside = calculateLengthInsideBounds(feature.geometry.coordinates, bounds);
              totalLengthInside += lengthInside;
            }
          });
        }
        
        // Call the completion handler with the length inside the box
        if (totalLengthInside > 0) {
          onSelectionComplete(totalLengthInside);
          // Save the bounds for green overlay
          setSelectedBounds(prev => [...prev, {
            south: bounds.getSouth(),
            north: bounds.getNorth(),
            west: bounds.getWest(),
            east: bounds.getEast()
          }]);
        }
        
        // Clean up
        if (selectionRectRef.current) {
          map.removeLayer(selectionRectRef.current);
          selectionRectRef.current = null;
        }
        
        setIsSelecting(false);
        setStartPoint(null);
        setCurrentPoint(null);
        
        // Re-enable map dragging
        map.dragging.enable();
      }
    }
  });

  return null;
}

export default function Map() {
  const [geoJsonData, setGeoJsonData] = useState({ trench: null, text: null, trenchLine: null });
  const [completedLength, setCompletedLength] = useState(0);
  const [totalLength, setTotalLength] = useState(0);
  const [selectedBounds, setSelectedBounds] = useState([]); // Array of bounds that have been selected
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
        
        // Calculate total length of all segments
        let total = 0;
        data.features.forEach((feature) => {
          if (feature.properties && feature.properties.layer === "Base Zanjas MT_CIVIL_H$0$C-STRM-CNTR") {
            const length = calculateLineLength(feature.geometry.coordinates);
            total += length;
          }
        });
        setTotalLength(total);
      })
      .catch((err) => {
        console.warn('Failed to load TRENCH-LINE.geojson:', err);
      });
  }, []);

  // Calculate remaining length
  const remainingLength = Math.max(0, totalLength - completedLength);
  const completedPercentage = totalLength > 0 ? (completedLength / totalLength * 100).toFixed(1) : 0;

  // Handle selection box completion - add length inside the box
  const handleSelectionComplete = useCallback((lengthInside) => {
    setCompletedLength(prev => {
      const newCompleted = prev + lengthInside;
      // Don't exceed total length
      return Math.min(newCompleted, totalLength);
    });
  }, [totalLength]);

  // Create GeoJSON for selected (green) segments based on selectedBounds
  // This clips the lines precisely to show only the parts inside the selection boxes
  const selectedGeoJson = useCallback(() => {
    if (!geoJsonData.trenchLine || selectedBounds.length === 0) return null;
    
    const selectedFeatures = [];
    
    geoJsonData.trenchLine.features.forEach((feature) => {
      if (feature.properties && feature.properties.layer === "Base Zanjas MT_CIVIL_H$0$C-STRM-CNTR") {
        const coords = feature.geometry.coordinates;
        
        // For each segment, clip it to each selected bounds
        for (let i = 0; i < coords.length - 1; i++) {
          const coord1 = coords[i];
          const coord2 = coords[i + 1];
          
          for (const bounds of selectedBounds) {
            const clipped = clipLineToBounds(coord1, coord2, bounds);
            
            if (clipped) {
              // Add the clipped segment as a green line
              selectedFeatures.push({
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: clipped
                }
              });
            }
          }
        }
      }
    });
    
    if (selectedFeatures.length === 0) return null;
    
    return {
      type: "FeatureCollection",
      features: selectedFeatures
    };
  }, [geoJsonData.trenchLine, selectedBounds]);

  const greenLineStyle = () => ({
    color: '#00ff00',
    weight: 6,
    opacity: 1
  });

  const onEachFeature = (feature, layer) => {
    if (feature.properties && feature.properties.text) {
      layer.bindPopup(feature.properties.text);
    }
  };

  const onEachTrenchLineFeature = useCallback((feature, layer) => {
    if (feature.properties && feature.properties.layer === "Base Zanjas MT_CIVIL_H$0$C-STRM-CNTR") {
      const key = feature.properties.fid ?? feature.properties.handle ?? JSON.stringify(feature.geometry);
      visibleLayersRef.current[key] = layer;
    }
  }, []);

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

  const trenchLineStyle = useCallback((feature) => {
    return { color: '#FFD700', weight: 5, opacity: 1 }; // Yellow
  }, []);

  const createTextIcon = (text) => {
    return new DivIcon({
      html: `<div style="font-size: 12px; font-weight: bold; color: black; background: rgba(255,255,255,0.8); padding: 2px 4px; border-radius: 3px; border: 1px solid #333; white-space: nowrap;">${text}</div>`,
      className: 'custom-text-icon',
      iconSize: [text.length * 8, 20],
      iconAnchor: [text.length * 4, 10]
    });
  };

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative" }}>
      {/* Progress Counter - Top Center */}
      <div style={{
        position: "absolute",
        top: "10px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        backgroundColor: "white",
        padding: "15px 25px",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
        display: "flex",
        gap: "20px",
        alignItems: "center"
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Total</div>
          <div style={{ fontWeight: "bold", fontSize: "16px" }}>{totalLength.toFixed(1)} m</div>
        </div>
        <div style={{ width: "1px", height: "40px", backgroundColor: "#ddd" }}></div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Completed</div>
          <div style={{ fontWeight: "bold", fontSize: "16px", color: "#00aa00" }}>{completedLength.toFixed(1)} m</div>
        </div>
        <div style={{ width: "1px", height: "40px", backgroundColor: "#ddd" }}></div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Progress</div>
          <div style={{ fontWeight: "bold", fontSize: "16px", color: "#0066cc" }}>{completedPercentage}%</div>
        </div>
        <div style={{ width: "1px", height: "40px", backgroundColor: "#ddd" }}></div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Remaining</div>
          <div style={{ fontWeight: "bold", fontSize: "16px", color: "#cc6600" }}>{remainingLength.toFixed(1)} m</div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        position: "absolute",
        top: "80px",
        right: "10px",
        zIndex: 1000,
        backgroundColor: "white",
        padding: "10px 15px",
        borderRadius: "5px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
        fontFamily: "Arial, sans-serif",
        fontSize: "14px"
      }}>
        <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Legend</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <div style={{
            width: "30px",
            height: "5px",
            backgroundColor: "#FFD700",
            borderRadius: "2px"
          }}></div>
          <span>Not Completed</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <div style={{
            width: "30px",
            height: "5px",
            backgroundColor: "#00ff00",
            borderRadius: "2px"
          }}></div>
          <span>Completed</span>
        </div>
        <div style={{ marginTop: "10px", fontSize: "12px", color: "#666" }}>
          Drag selection box to measure
        </div>
      </div>
      <MapContainer
        whenCreated={(map) => { mapRef.current = map; }}
        center={[52.685, -1.669]}
        zoom={18}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <SelectionBox 
          onSelectionComplete={handleSelectionComplete}
          visibleLayersRef={visibleLayersRef}
          geoJsonData={geoJsonData}
          setSelectedBounds={setSelectedBounds}
        />
        {geoJsonData.trench && (
          <GeoJSON
            data={geoJsonData.trench}
            style={style}
            onEachFeature={onEachFeature}
          />
        )}
        {geoJsonData.trenchLine && (
          <GeoJSON
            data={geoJsonData.trenchLine}
            style={trenchLineStyle}
            onEachFeature={onEachTrenchLineFeature}
          />
        )}
        {selectedGeoJson() && (
          <GeoJSON
            key={`selected-${selectedBounds.length}`}
            data={selectedGeoJson()}
            style={greenLineStyle}
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
