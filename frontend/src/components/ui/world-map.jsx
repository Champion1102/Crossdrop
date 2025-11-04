import { useEffect, useRef, useState } from "react";
import DottedMap from "dotted-map";

export default function WorldMap({
  dots = [],
  lineColor = "#0ea5e9",
  className = "",
}) {
  const mapRef = useRef(null);
  const [svgContent, setSvgContent] = useState("");

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new DottedMap({
      height: 60,
      grid: "diagonal",
    });

    const svgMap = map.getSVG({
      radius: 0.22,
      shape: "circle",
      color: "#52525b",
    });

    setSvgContent(svgMap);
  }, []);

  const projectPoint = (lat, lng, width, height) => {
    const x = (lng + 180) * (width / 360);
    const y = (90 - lat) * (height / 180);
    return { x, y };
  };

  return (
    <div className={`relative w-full ${className}`} style={{ minHeight: "500px" }}>
      <svg
        ref={mapRef}
        viewBox="0 0 1000 500"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {svgContent && <g dangerouslySetInnerHTML={{ __html: svgContent }} />}
        
        {dots.map((dot, idx) => {
          const width = 1000;
          const height = 500;
          const start = projectPoint(dot.start.lat, dot.start.lng, width, height);
          const end = projectPoint(dot.end.lat, dot.end.lng, width, height);

          return (
            <g key={idx}>
              {/* Line */}
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={lineColor}
                strokeWidth="2"
                strokeOpacity="0.4"
              />
              
              {/* Start point */}
              <circle
                cx={start.x}
                cy={start.y}
                r="5"
                fill={lineColor}
                opacity="0.8"
              />
              
              {/* End point */}
              <circle
                cx={end.x}
                cy={end.y}
                r="5"
                fill={lineColor}
                opacity="0.8"
              />

              {/* Start label */}
              {dot.start.label && (
                <text
                  x={start.x}
                  y={start.y - 10}
                  textAnchor="middle"
                  className="fill-gray-700 dark:fill-gray-300 text-xs"
                  fontSize="12"
                >
                  {dot.start.label}
                </text>
              )}

              {/* End label */}
              {dot.end.label && (
                <text
                  x={end.x}
                  y={end.y - 10}
                  textAnchor="middle"
                  className="fill-gray-700 dark:fill-gray-300 text-xs"
                  fontSize="12"
                >
                  {dot.end.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
