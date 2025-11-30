// src/components/Map.jsx
import { useEffect, useState, useRef } from "react";

export default function Map() {
  const [svgContent, setSvgContent] = useState({ trench: "", text: "" });
  const [zoom, setZoom] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    // Load trench.svg
    fetch("/trench.svg")
      .then((res) => res.text())
      .then((text) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, "image/svg+xml");
          const svg = doc.querySelector("svg");
          if (!svg) {
            setSvgContent(prev => ({ ...prev, trench: text }));
            return;
          }

          // Add style for hover class and hit overlay
          const styleEl = doc.createElementNS("http://www.w3.org/2000/svg", "style");
          styleEl.textContent = `
            .hoverable { transition: stroke 0.12s, stroke-width 0.12s; }
            .hoverable.hovered { stroke: red !important; stroke-width: 3 !important; }
          `;
          svg.insertBefore(styleEl, svg.firstChild);

            // Find target group(s) named 'liness' (id, class, or inkscape:label)
            const layerName = 'liness';
            const groups = Array.from(svg.getElementsByTagName('g')).filter((g) => {
              const id = g.getAttribute('id');
              const cls = g.getAttribute('class');
              const inkscapeLabel = g.getAttribute('inkscape:label') || g.getAttribute('data-label') || g.getAttribute('label');
              return id === layerName || (cls && cls.split(/\s+/).includes(layerName)) || inkscapeLabel === layerName;
            });

            if (groups.length === 0) {
              // No explicit group found — do not modify everything. Leave SVG unchanged and warn.
              // Fallback: do nothing so only explicit layer will be hovered when available.
              console.warn('No group named "' + layerName + '" found in trench.svg — hover not applied.');
            } else {
              groups.forEach((group) => {
                const paths = group.querySelectorAll('path[fill="none"]');
                paths.forEach((p) => {
                  if (p.classList.contains('hoverable')) return;
                  p.classList.add('hoverable');

                  const hit = p.cloneNode(true);
                  hit.setAttribute('stroke-opacity', '0');
                  const origW = parseFloat(p.getAttribute('stroke-width') || '1');
                  const hitW = Math.max(origW * 6, 8);
                  hit.setAttribute('stroke-width', String(hitW));
                  hit.setAttribute('class', 'hover-hit');
                  hit.setAttribute('style', 'pointer-events:stroke');
                  // handlers toggle hovered class on the visible path
                  hit.setAttribute('onmouseover', 'this.previousElementSibling.classList.add("hovered")');
                  hit.setAttribute('onmouseout', 'this.previousElementSibling.classList.remove("hovered")');

                  if (p.nextSibling) p.parentNode.insertBefore(hit, p.nextSibling);
                  else p.parentNode.appendChild(hit);
                });
              });
            }

          const serializer = new XMLSerializer();
          const modified = serializer.serializeToString(doc);
          setSvgContent(prev => ({ ...prev, trench: modified }));
        } catch (err) {
          // fallback: use raw text
          setSvgContent(prev => ({ ...prev, trench: text }));
        }
      });

    // Load text.svg
    fetch("/text.svg")
      .then((res) => res.text())
      .then((text) => {
        setSvgContent(prev => ({ ...prev, text: text }));
      })
      .catch((err) => {
        console.warn('Failed to load text.svg:', err);
        setSvgContent(prev => ({ ...prev, text: '' }));
      });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const handleWheelNonPassive = (e) => {
        e.preventDefault();
        if (e.deltaY > 0) {
          // Scroll down: zoom out
          setZoom(z => Math.max(0.1, z / 1.2));
        } else {
          // Scroll up: zoom in
          setZoom(z => z * 1.2);
        }
      };

      container.addEventListener('wheel', handleWheelNonPassive, { passive: false });

      return () => {
        container.removeEventListener('wheel', handleWheelNonPassive);
      };
    }
  }, []);

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
      className="border border-gray-400 w-full flex justify-center mt-4 overflow-hidden cursor-grab relative"
      style={{
        transform: `scale(${zoom}) translate(${translateX}px, ${translateY}px)`,
        transformOrigin: 'center',
        transition: isPanning ? 'none' : 'transform 0.1s'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div dangerouslySetInnerHTML={{ __html: svgContent.trench }} />
      <div dangerouslySetInnerHTML={{ __html: svgContent.text }} className="absolute inset-0" />
    </div>
  );
}
