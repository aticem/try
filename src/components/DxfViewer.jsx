import { useEffect, useRef } from "react";
import DxfParser from "dxf-parser";

export default function DxfViewer() {
  const canvasRef = useRef(null);

  useEffect(() => {
    async function loadDXF() {
      const response = await fetch("/trench.dxf");
      const text = await response.text();

      const parser = new DxfParser();
      let dxf;

      try {
        dxf = parser.parseSync(text);
      } catch (err) {
        console.error("DXF parse error:", err);
        return;
      }

      const entities = dxf.entities || [];
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "black";

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      entities.forEach((e) => {
        if (e.type === "LINE") {
          minX = Math.min(minX, e.start.x, e.end.x);
          minY = Math.min(minY, e.start.y, e.end.y);
          maxX = Math.max(maxX, e.start.x, e.end.x);
          maxY = Math.max(maxY, e.start.y, e.end.y);
        }
      });

      const dx = maxX - minX;
      const dy = maxY - minY;
      const scale = Math.min(canvas.width / dx, canvas.height / dy) * 0.9;

      const offsetX = (canvas.width - dx * scale) / 2;
      const offsetY = (canvas.height - dy * scale) / 2;

      function toScreen(x, y) {
        return {
          x: (x - minX) * scale + offsetX,
          y: canvas.height - ((y - minY) * scale + offsetY),
        };
      }

      ctx.beginPath();
      entities.forEach((e) => {
        if (e.type === "LINE") {
          const s = toScreen(e.start.x, e.start.y);
          const t = toScreen(e.end.x, e.end.y);
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
        }
      });
      ctx.stroke();
    }

    loadDXF();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100vw",
        height: "100vh",
        background: "#f0f0f0",
        display: "block",
      }}
    ></canvas>
  );
}
