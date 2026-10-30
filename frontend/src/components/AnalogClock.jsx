import React, { useEffect, useState } from 'react';

/**
 * High-precision server-synchronized Analog Clock
 * Uses server-time offset with second-level tick updates.
 */
export default function AnalogClock({ serverTime, size = 68 }) {
  const [now, setNow] = useState(() => {
    if (serverTime) {
      const serverDate = new Date(serverTime);
      const clientDate = new Date();
      return new Date(clientDate.getTime() + (serverDate.getTime() - clientDate.getTime()));
    }
    return new Date();
  });

  useEffect(() => {
    const serverMs = serverTime ? new Date(serverTime).getTime() : Date.now();
    const localStart = Date.now();
    const offset = serverMs - localStart;

    const interval = setInterval(() => {
      setNow(new Date(Date.now() + offset));
    }, 1000);

    return () => clearInterval(interval);
  }, [serverTime]);

  const seconds = now.getSeconds();
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;

  const secDeg = seconds * 6;
  const minDeg = minutes * 6;
  const hourDeg = hours * 30;

  const center = size / 2;
  const radius = center - 3;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))' }}
      >
        {/* Face */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="var(--surface, #FFFFFF)"
          stroke="var(--border, #E5E7EB)"
          strokeWidth="2"
        />

        {/* 12 Hour tick marks */}
        {[...Array(12)].map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const isMain = i % 3 === 0;
          const tickLen = isMain ? 5 : 3;
          const x1 = center + (radius - 2) * Math.sin(angle);
          const y1 = center - (radius - 2) * Math.cos(angle);
          const x2 = center + (radius - 2 - tickLen) * Math.sin(angle);
          const y2 = center - (radius - 2 - tickLen) * Math.cos(angle);

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isMain ? 'var(--primary, #6D28D9)' : 'var(--muted, #9CA3AF)'}
              strokeWidth={isMain ? 1.5 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Hour Hand */}
        <line
          x1={center}
          y1={center}
          x2={center + radius * 0.5 * Math.sin((hourDeg * Math.PI) / 180)}
          y2={center - radius * 0.5 * Math.cos((hourDeg * Math.PI) / 180)}
          stroke="var(--text, #1F2937)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Minute Hand */}
        <line
          x1={center}
          y1={center}
          x2={center + radius * 0.72 * Math.sin((minDeg * Math.PI) / 180)}
          y2={center - radius * 0.72 * Math.cos((minDeg * Math.PI) / 180)}
          stroke="var(--text, #374151)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Second Hand (Primary Brand color) */}
        <line
          x1={center - radius * 0.15 * Math.sin((secDeg * Math.PI) / 180)}
          y1={center + radius * 0.15 * Math.cos((secDeg * Math.PI) / 180)}
          x2={center + radius * 0.82 * Math.sin((secDeg * Math.PI) / 180)}
          y2={center - radius * 0.82 * Math.cos((secDeg * Math.PI) / 180)}
          stroke="var(--primary, #6D28D9)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />

        {/* Center Pivot Pin */}
        <circle cx={center} cy={center} r="3" fill="var(--primary, #6D28D9)" />
        <circle cx={center} cy={center} r="1.2" fill="#FFFFFF" />
      </svg>
    </div>
  );
}
