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
function SelectionBox({ mode, onSelectionComplete, onUnselectionComplete, onMeasurementComplete, onMeasurementUnselect, visibleLayersRef, geoJsonData, setSelectedBounds, selectedSegments, setSelectedSegments, measurementSegments }) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [isUnselecting, setIsUnselecting] = useState(false); // Right-click unselect mode
  const [startPoint, setStartPoint] = useState(null);
  const [currentPoint, setCurrentPoint] = useState(null);
  const selectionRectRef = useRef(null);

  // Check if a point on the line is already selected
  const isPointAlreadySelected = (coord, segments) => {
    const epsilon = 0.00000001; // Small tolerance for floating point comparison
    for (const seg of segments) {
      // Check if point is on or very close to this selected segment
      const [x, y] = coord;
      const [x1, y1] = seg.start;
      const [x2, y2] = seg.end;
      
      // Check if point is between start and end (with some tolerance)
      const minX = Math.min(x1, x2) - epsilon;
      const maxX = Math.max(x1, x2) + epsilon;
      const minY = Math.min(y1, y2) - epsilon;
      const maxY = Math.max(y1, y2) + epsilon;
      
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        // Check if point is on the line segment
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < epsilon) {
          // Segment is a point
          if (Math.abs(x - x1) < epsilon && Math.abs(y - y1) < epsilon) {
            return true;
          }
        } else {
          // Calculate distance from point to line
          const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (len * len)));
          const projX = x1 + t * dx;
          const projY = y1 + t * dy;
          const dist = Math.sqrt((x - projX) * (x - projX) + (y - projY) * (y - projY));
          if (dist < epsilon) {
            return true;
          }
        }
      }
    }
    return false;
  };

  // Check if a segment overlaps with already selected segments and return non-overlapping parts
  const getUnselectedPortion = (clippedStart, clippedEnd, segments) => {
    // Simplified: if either endpoint is already selected, skip this segment
    // For more precision, we'd need to split segments
    const startSelected = isPointAlreadySelected(clippedStart, segments);
    const endSelected = isPointAlreadySelected(clippedEnd, segments);
    
    if (startSelected && endSelected) {
      return null; // Entire segment already selected
    }
    
    // For now, return the full clipped segment if any part is new
    return { start: clippedStart, end: clippedEnd };
  };

  // Check if two segments overlap (for unselection)
  const segmentsOverlap = (seg1Start, seg1End, seg2) => {
    const epsilon = 0.0000001;
    const [x1, y1] = seg1Start;
    const [x2, y2] = seg1End;
    const [sx1, sy1] = seg2.start;
    const [sx2, sy2] = seg2.end;
    
    // Check if the segments are on the same line and overlap
    // Simplified: check if any endpoint of one segment is on/near the other
    const isNear = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < epsilon) return Math.abs(px - ax) < epsilon && Math.abs(py - ay) < epsilon;
      
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)));
      const projX = ax + t * dx;
      const projY = ay + t * dy;
      const dist = Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
      return dist < epsilon;
    };
    
    return isNear(x1, y1, sx1, sy1, sx2, sy2) || 
           isNear(x2, y2, sx1, sy1, sx2, sy2) ||
           isNear(sx1, sy1, x1, y1, x2, y2) ||
           isNear(sx2, sy2, x1, y1, x2, y2);
  };

  const map = useMapEvents({
    mousedown: (e) => {
      // Left click = select/measure, Right click = unselect (works in both modes)
      if (e.originalEvent.button === 0) {
        setIsSelecting(true);
        setIsUnselecting(false);
        setStartPoint(e.latlng);
        setCurrentPoint(e.latlng);
        map.dragging.disable();
      } else if (e.originalEvent.button === 2) {
        // Right click unselect works in both modes
        setIsUnselecting(true);
        setIsSelecting(false);
        setStartPoint(e.latlng);
        setCurrentPoint(e.latlng);
        map.dragging.disable();
      }
    },
    mousemove: (e) => {
      if ((isSelecting || isUnselecting) && startPoint) {
        setCurrentPoint(e.latlng);
        
        // Update or create selection rectangle
        const bounds = L.latLngBounds(startPoint, e.latlng);
        let boxColor = '#0066ff'; // Default blue for marking
        if (isUnselecting) {
          boxColor = '#ff0000'; // Red for unselect (both modes)
        } else if (mode === 'measurement') {
          boxColor = '#FFA500'; // Orange for measurement
        }
        
        if (selectionRectRef.current) {
          selectionRectRef.current.setBounds(bounds);
        } else {
          selectionRectRef.current = L.rectangle(bounds, {
            color: boxColor,
            weight: 2,
            fillColor: boxColor,
            fillOpacity: 0.2,
            dashArray: '5, 5'
          }).addTo(map);
        }
      }
    },
    mouseup: (e) => {
      if ((isSelecting || isUnselecting) && startPoint) {
        const bounds = L.latLngBounds(startPoint, e.latlng);
        const boundsObj = {
          south: bounds.getSouth(),
          north: bounds.getNorth(),
          west: bounds.getWest(),
          east: bounds.getEast()
        };
        
        if (isUnselecting) {
          // UNSELECT MODE - Remove both marking segments and measurement segments inside the box
          let totalLengthRemoved = 0;
          const markingSegmentsToRemove = [];
          const measurementIndicesToRemove = [];
          
          if (geoJsonData.trenchLine) {
            geoJsonData.trenchLine.features.forEach((feature, featureIndex) => {
              if (feature.properties && feature.properties.layer === "Base Zanjas MT_CIVIL_H$0$C-STRM-CNTR") {
                const coords = feature.geometry.coordinates;
                
                for (let i = 0; i < coords.length - 1; i++) {
                  const coord1 = coords[i];
                  const coord2 = coords[i + 1];
                  
                  // Clip line to bounds
                  const clipped = clipLineToBounds(coord1, coord2, boundsObj);
                  
                  if (clipped) {
                    // Find and mark marking segments that overlap with this clipped portion
                    selectedSegments.forEach((seg, idx) => {
                      if (segmentsOverlap(clipped[0], clipped[1], seg)) {
                        if (!markingSegmentsToRemove.includes(idx)) {
                          markingSegmentsToRemove.push(idx);
                          totalLengthRemoved += calculateDistance(seg.start, seg.end);
                        }
                      }
                    });
                    
                    // Find and mark measurement segments that overlap with this clipped portion
                    measurementSegments.forEach((measurement, mIdx) => {
                      measurement.segments.forEach((seg) => {
                        if (segmentsOverlap(clipped[0], clipped[1], seg)) {
                          if (!measurementIndicesToRemove.includes(mIdx)) {
                            measurementIndicesToRemove.push(mIdx);
                          }
                        }
                      });
                    });
                  }
                }
              }
            });
          }
          
          // Remove marking segments
          if (totalLengthRemoved > 0 && markingSegmentsToRemove.length > 0) {
            onUnselectionComplete(totalLengthRemoved, markingSegmentsToRemove);
          }
          
          // Remove measurement segments
          if (measurementIndicesToRemove.length > 0) {
            onMeasurementUnselect(measurementIndicesToRemove);
          }
        } else if (mode === 'measurement') {
          // MEASUREMENT MODE - Just measure and display, don't add to completed
          let totalLengthInside = 0;
          const newMeasurementSegments = [];
          
          if (geoJsonData.trenchLine) {
            geoJsonData.trenchLine.features.forEach((feature, featureIndex) => {
              if (feature.properties && feature.properties.layer === "Base Zanjas MT_CIVIL_H$0$C-STRM-CNTR") {
                const coords = feature.geometry.coordinates;
                
                for (let i = 0; i < coords.length - 1; i++) {
                  const coord1 = coords[i];
                  const coord2 = coords[i + 1];
                  
                  // Clip line to bounds
                  const clipped = clipLineToBounds(coord1, coord2, boundsObj);
                  
                  if (clipped) {
                    const clippedLength = calculateDistance(clipped[0], clipped[1]);
                    totalLengthInside += clippedLength;
                    newMeasurementSegments.push({ start: clipped[0], end: clipped[1] });
                  }
                }
              }
            });
          }
          
          if (totalLengthInside > 0) {
            onMeasurementComplete(totalLengthInside, newMeasurementSegments, boundsObj);
          }
        } else {
          // MARKING SELECT MODE - Add segments that are inside the box
          let totalLengthInside = 0;
          const newSelectedSegments = [];
          
          if (geoJsonData.trenchLine) {
            geoJsonData.trenchLine.features.forEach((feature, featureIndex) => {
              if (feature.properties && feature.properties.layer === "Base Zanjas MT_CIVIL_H$0$C-STRM-CNTR") {
                const coords = feature.geometry.coordinates;
                
                for (let i = 0; i < coords.length - 1; i++) {
                  const coord1 = coords[i];
                  const coord2 = coords[i + 1];
                  
                  // Clip line to bounds
                  const clipped = clipLineToBounds(coord1, coord2, boundsObj);
                  
                  if (clipped) {
                    // Check if this clipped portion overlaps with already selected segments
                    const unselected = getUnselectedPortion(clipped[0], clipped[1], selectedSegments);
                    
                    if (unselected) {
                      const clippedLength = calculateDistance(unselected.start, unselected.end);
                      totalLengthInside += clippedLength;
                      newSelectedSegments.push(unselected);
                    }
                  }
                }
              }
            });
          }
          
          // Call the completion handler with the length inside the box (only new segments)
          if (totalLengthInside > 0) {
            onSelectionComplete(totalLengthInside);
            // Save the bounds for potential future use
            setSelectedBounds(prev => [...prev, boundsObj]);
            // Add new selected segments
            setSelectedSegments(prev => [...prev, ...newSelectedSegments]);
          }
        }
        
        // Clean up
        if (selectionRectRef.current) {
          map.removeLayer(selectionRectRef.current);
          selectionRectRef.current = null;
        }
        
        setIsSelecting(false);
        setIsUnselecting(false);
        setStartPoint(null);
        setCurrentPoint(null);
        
        // Re-enable map dragging
        map.dragging.enable();
      }
    },
    contextmenu: (e) => {
      // Prevent default context menu
      e.originalEvent.preventDefault();
    }
  });

  return null;
}

export default function Map() {
  const [geoJsonData, setGeoJsonData] = useState({ trench: null, text: null, trenchLine: null });
  const [completedLength, setCompletedLength] = useState(0);
  const [totalLength, setTotalLength] = useState(0);
  const [selectedBounds, setSelectedBounds] = useState([]); // Array of bounds that have been selected
  const [selectedSegments, setSelectedSegments] = useState([]); // Array of {start: [lng, lat], end: [lng, lat]} for green overlay
  const [measurementSegments, setMeasurementSegments] = useState([]); // Array of {segments: [...], length: number} for yellow measurement overlay
  const [history, setHistory] = useState([]); // For undo - stores previous states
  const [redoStack, setRedoStack] = useState([]); // For redo - stores undone states
  const [mode, setMode] = useState('marking'); // 'marking' or 'measurement'
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
    // Save current state to history before making changes
    setHistory(prev => [...prev, { completedLength, selectedBounds, selectedSegments: [...selectedSegments] }]);
    setRedoStack([]); // Clear redo stack on new action
    
    setCompletedLength(prev => {
      const newCompleted = prev + lengthInside;
      // Don't exceed total length
      return Math.min(newCompleted, totalLength);
    });
  }, [totalLength, completedLength, selectedBounds, selectedSegments]);

  // Handle unselection - remove length from completed
  const handleUnselectionComplete = useCallback((lengthRemoved, segmentIndicesToRemove) => {
    // Save current state to history before making changes
    setHistory(prev => [...prev, { completedLength, selectedBounds, selectedSegments: [...selectedSegments] }]);
    setRedoStack([]); // Clear redo stack on new action
    
    // Remove segments by index
    setSelectedSegments(prev => prev.filter((_, idx) => !segmentIndicesToRemove.includes(idx)));
    
    setCompletedLength(prev => {
      const newCompleted = prev - lengthRemoved;
      // Don't go below 0
      return Math.max(0, newCompleted);
    });
  }, [completedLength, selectedBounds, selectedSegments]);

  // Handle measurement complete - show yellow overlay with length label
  const handleMeasurementComplete = useCallback((length, segments, bounds) => {
    // Calculate center of the measured segments for label placement
    let sumLat = 0, sumLng = 0, count = 0;
    segments.forEach(seg => {
      sumLng += (seg.start[0] + seg.end[0]) / 2;
      sumLat += (seg.start[1] + seg.end[1]) / 2;
      count++;
    });
    const centerLng = count > 0 ? sumLng / count : 0;
    const centerLat = count > 0 ? sumLat / count : 0;
    
    setMeasurementSegments(prev => [...prev, {
      segments,
      length,
      center: [centerLng, centerLat]
    }]);
  }, []);

  // Handle measurement unselect - remove measurement segments by index
  const handleMeasurementUnselect = useCallback((indicesToRemove) => {
    setMeasurementSegments(prev => prev.filter((_, idx) => !indicesToRemove.includes(idx)));
  }, []);

  // Undo function
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    
    const lastState = history[history.length - 1];
    
    // Save current state to redo stack
    setRedoStack(prev => [...prev, { completedLength, selectedBounds, selectedSegments: [...selectedSegments] }]);
    
    // Restore previous state
    setCompletedLength(lastState.completedLength);
    setSelectedBounds(lastState.selectedBounds);
    setSelectedSegments(lastState.selectedSegments);
    
    // Remove last item from history
    setHistory(prev => prev.slice(0, -1));
  }, [history, completedLength, selectedBounds, selectedSegments]);

  // Redo function
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    const nextState = redoStack[redoStack.length - 1];
    
    // Save current state to history
    setHistory(prev => [...prev, { completedLength, selectedBounds, selectedSegments: [...selectedSegments] }]);
    
    // Restore next state
    setCompletedLength(nextState.completedLength);
    setSelectedBounds(nextState.selectedBounds);
    setSelectedSegments(nextState.selectedSegments);
    
    // Remove last item from redo stack
    setRedoStack(prev => prev.slice(0, -1));
  }, [redoStack, completedLength, selectedBounds, selectedSegments]);

  // Keyboard shortcuts (Ctrl+Z for Undo, Ctrl+Y for Redo)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          handleUndo();
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Create GeoJSON for selected (green) segments - shows only the actually selected portions
  const selectedGeoJson = useCallback(() => {
    if (selectedSegments.length === 0) return null;
    
    const selectedFeatures = selectedSegments.map(seg => ({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [seg.start, seg.end]
      }
    }));
    
    return {
      type: "FeatureCollection",
      features: selectedFeatures
    };
  }, [selectedSegments]);

  // Create GeoJSON for measurement (yellow) segments
  const measurementGeoJson = useCallback(() => {
    if (measurementSegments.length === 0) return null;
    
    const measurementFeatures = [];
    measurementSegments.forEach(measurement => {
      measurement.segments.forEach(seg => {
        measurementFeatures.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [seg.start, seg.end]
          }
        });
      });
    });
    
    return {
      type: "FeatureCollection",
      features: measurementFeatures
    };
  }, [measurementSegments]);

  // Clear all measurements
  const clearMeasurements = useCallback(() => {
    setMeasurementSegments([]);
  }, []);

  const greenLineStyle = () => ({
    color: '#00ff00',
    weight: 6,
    opacity: 1
  });

  const yellowLineStyle = () => ({
    color: '#FFA500',
    weight: 6,
    opacity: 1
  });

  // Create measurement label icon
  const createMeasurementIcon = (length) => {
    return new DivIcon({
      html: `<div style="font-size: 14px; font-weight: bold; color: white; background: #FFA500; padding: 4px 8px; border-radius: 4px; border: 2px solid #cc8400; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${length.toFixed(1)} m</div>`,
      className: 'measurement-label-icon',
      iconSize: [80, 28],
      iconAnchor: [40, 14]
    });
  };

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
        {/* Mode Buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setMode('marking')}
            title="Marking Mode"
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "6px",
              backgroundColor: mode === 'marking' ? "#00aa00" : "#f0f0f0",
              color: mode === 'marking' ? "white" : "#333",
              cursor: "pointer",
              fontWeight: "bold",
              transition: "background-color 0.2s"
            }}
          >
            ✓ Marking
          </button>
          <button
            onClick={() => setMode('measurement')}
            title="Measurement Mode"
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "6px",
              backgroundColor: mode === 'measurement' ? "#FFA500" : "#f0f0f0",
              color: mode === 'measurement' ? "white" : "#333",
              cursor: "pointer",
              fontWeight: "bold",
              transition: "background-color 0.2s"
            }}
          >
            📏 Measurement
          </button>
          {mode === 'measurement' && measurementSegments.length > 0 && (
            <button
              onClick={clearMeasurements}
              title="Clear Measurements"
              style={{
                padding: "8px 12px",
                border: "none",
                borderRadius: "6px",
                backgroundColor: "#ff4444",
                color: "white",
                cursor: "pointer",
                fontWeight: "bold",
                transition: "background-color 0.2s"
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>
        
        <div style={{ width: "1px", height: "40px", backgroundColor: "#ddd" }}></div>
        
        {/* Undo Button */}
        <button
          onClick={handleUndo}
          disabled={history.length === 0}
          title="Undo (Ctrl+Z)"
          style={{
            width: "36px",
            height: "36px",
            border: "none",
            borderRadius: "6px",
            backgroundColor: history.length === 0 ? "#e0e0e0" : "#f0f0f0",
            cursor: history.length === 0 ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background-color 0.2s"
          }}
          onMouseEnter={(e) => { if (history.length > 0) e.target.style.backgroundColor = "#ddd"; }}
          onMouseLeave={(e) => { if (history.length > 0) e.target.style.backgroundColor = "#f0f0f0"; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={history.length === 0 ? "#999" : "#333"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </button>
        
        {/* Redo Button */}
        <button
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          title="Redo (Ctrl+Y)"
          style={{
            width: "36px",
            height: "36px",
            border: "none",
            borderRadius: "6px",
            backgroundColor: redoStack.length === 0 ? "#e0e0e0" : "#f0f0f0",
            cursor: redoStack.length === 0 ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background-color 0.2s"
          }}
          onMouseEnter={(e) => { if (redoStack.length > 0) e.target.style.backgroundColor = "#ddd"; }}
          onMouseLeave={(e) => { if (redoStack.length > 0) e.target.style.backgroundColor = "#f0f0f0"; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={redoStack.length === 0 ? "#999" : "#333"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6"/>
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
          </svg>
        </button>
        
        <div style={{ width: "1px", height: "40px", backgroundColor: "#ddd" }}></div>
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
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <div style={{
            width: "30px",
            height: "5px",
            backgroundColor: "#FFA500",
            borderRadius: "2px"
          }}></div>
          <span>Measurement</span>
        </div>
        <div style={{ marginTop: "10px", fontSize: "12px", color: "#666" }}>
          <div><b>Marking:</b> Left=Select, Right=Unselect</div>
          <div><b>Measurement:</b> Left=Measure</div>
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
          mode={mode}
          onSelectionComplete={handleSelectionComplete}
          onUnselectionComplete={handleUnselectionComplete}
          onMeasurementComplete={handleMeasurementComplete}
          onMeasurementUnselect={handleMeasurementUnselect}
          visibleLayersRef={visibleLayersRef}
          geoJsonData={geoJsonData}
          setSelectedBounds={setSelectedBounds}
          selectedSegments={selectedSegments}
          setSelectedSegments={setSelectedSegments}
          measurementSegments={measurementSegments}
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
            key={`selected-${selectedSegments.length}`}
            data={selectedGeoJson()}
            style={greenLineStyle}
          />
        )}
        {measurementGeoJson() && (
          <GeoJSON
            key={`measurement-${measurementSegments.length}`}
            data={measurementGeoJson()}
            style={yellowLineStyle}
          />
        )}
        {/* Measurement labels */}
        {measurementSegments.map((measurement, index) => (
          <Marker
            key={`measurement-label-${index}`}
            position={[measurement.center[1], measurement.center[0]]}
            icon={createMeasurementIcon(measurement.length)}
          />
        ))}
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
