// src/components/Map.jsx
import { useEffect, useState, useRef } from "react";

export default function Map() {
  const [svgContent, setSvgContent] = useState("");
  const [zoom, setZoom] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    fetch("/trench.svg")
      .then((res) => res.text())
      .then((text) => setSvgContent(text));
  }, []);

  const handleWheel = (e) => {
    e.preventDefault();
    if (e.deltaY > 0) {
      // Scroll down: zoom out
      setZoom(z => Math.max(0.1, z / 1.2));
    } else {
      // Scroll up: zoom in
      setZoom(z => z * 1.2);
    }
  };

  const handleMouseDown = (e) => {
    if (e.button === 1) { // Middle button
      setIsPanning(true);
      setStartX(e.clientX - translateX);
      setStartY(e.clientY - translateY);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setTranslateX(e.clientX - startX);
      setTranslateY(e.clientY - startY);
    }
  };

  const handleMouseUp = (e) => {
    if (e.button === 1) {
      setIsPanning(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="border border-gray-400 w-full flex justify-center mt-4 overflow-hidden cursor-grab"
      style={{
        transform: `scale(${zoom}) translate(${translateX}px, ${translateY}px)`,
        transformOrigin: 'center',
        transition: isPanning ? 'none' : 'transform 0.1s'
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}
