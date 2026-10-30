import React from 'react';

/**
 * High-fidelity Digital QR Code SVG for Staff Verification Card
 */
export default function QRCodeDisplay({ token, employeeId, size = 110 }) {
  // Deterministic 21x21 QR matrix generated from token/employeeId
  const gridSize = 21;
  const cellSize = size / gridSize;

  // Pattern seed hash
  const str = `${employeeId || 'STAFF'}:${token || 'TOKEN'}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  // Position detection patterns in 3 corners (7x7 squares)
  const isCorner = (r, c) => {
    if (r < 7 && c < 7) return true; // Top-left
    if (r < 7 && c >= gridSize - 7) return true; // Top-right
    if (r >= gridSize - 7 && c < 7) return true; // Bottom-left
    return false;
  };

  const isFinderBox = (r, c) => {
    // 7x7 outer border, 3x3 inner square
    const checkFinder = (startR, startC) => {
      const dr = r - startR;
      const dc = c - startC;
      if (dr >= 0 && dr < 7 && dc >= 0 && dc < 7) {
        if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true;
        if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) return true;
        return false;
      }
      return null;
    };

    const tl = checkFinder(0, 0);
    if (tl !== null) return tl;
    const tr = checkFinder(0, gridSize - 7);
    if (tr !== null) return tr;
    const bl = checkFinder(gridSize - 7, 0);
    if (bl !== null) return bl;

    return false;
  };

  const cells = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (isCorner(r, c)) {
        if (isFinderBox(r, c)) {
          cells.push({ r, c });
        }
      } else {
        // Pseudo-random pseudo-QR data cells
        const val = Math.abs(Math.sin((r * 31 + c * 17 + hash) * 9999));
        if (val > 0.48) {
          cells.push({ r, c });
        }
      }
    }
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        padding: 6,
        background: '#FFFFFF',
        borderRadius: 'var(--radius-sm, 6px)',
        border: '1px solid var(--border, #E5E7EB)',
        boxShadow: 'var(--shadow-xs)',
      }}
      title={`Staff Verification Token: ${token || employeeId}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect width={size} height={size} fill="#FFFFFF" />
        {cells.map(({ r, c }) => (
          <rect
            key={`${r}-${c}`}
            x={c * cellSize}
            y={r * cellSize}
            width={cellSize - 0.4}
            height={cellSize - 0.4}
            fill="#111827"
            rx="0.8"
          />
        ))}
      </svg>
    </div>
  );
}
