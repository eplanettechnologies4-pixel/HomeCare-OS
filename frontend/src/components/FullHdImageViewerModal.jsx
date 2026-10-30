import React, { useState, useEffect } from 'react';
import {
  X, ZoomIn, ZoomOut, RotateCcw, Download, Sparkles, Maximize2, ShieldCheck, Check
} from 'lucide-react';

export default function FullHdImageViewerModal({
  isOpen,
  onClose,
  imageUrl,
  title = 'Full HD Document Inspector',
  badgeText = 'Full HD 1080p',
}) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && imageUrl) {
      setZoomLevel(1);
      setLoading(true);
      const img = new Image();
      img.onload = () => {
        setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
        setLoading(false);
      };
      img.onerror = () => {
        setLoading(false);
      };
      img.src = imageUrl;
    }
  }, [isOpen, imageUrl]);

  if (!isOpen || !imageUrl) return null;

  const handleZoomIn = () => setZoomLevel((z) => Math.min(3, z + 0.35));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.6, z - 0.35));
  const handleResetZoom = () => setZoomLevel(1);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `HomeCare_FullHD_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 10001,
        background: 'rgba(5, 8, 16, 0.92)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: '92vw',
          maxWidth: 960,
          maxHeight: '94vh',
          background: '#090d16',
          borderRadius: 14,
          border: '1px solid rgba(253, 224, 71, 0.35)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(90deg, #1e1b4b 0%, #090d16 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'linear-gradient(135deg, #FDE047 0%, #D97706 100%)',
                color: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#fff' }}>
                {title}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge badge-amber" style={{ fontSize: '0.62rem', padding: '1px 6px' }}>
                  {badgeText}
                </span>
                {dimensions.width > 0 && (
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    Original: {dimensions.width} × {dimensions.height} px
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Zoom Controls */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 2, gap: 2 }}>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={handleZoomOut}
                title="Zoom Out"
                style={{ color: '#fff', padding: '4px 8px' }}
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleResetZoom}
                title="Reset Zoom"
                style={{ color: '#FDE047', fontSize: '0.74rem', minWidth: 44, padding: '4px 6px' }}
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={handleZoomIn}
                title="Zoom In"
                style={{ color: '#fff', padding: '4px 8px' }}
              >
                <ZoomIn size={14} />
              </button>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleDownload}
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', gap: 5 }}
            >
              <Download size={13} /> Save HD
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onClose}
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Image Viewing Stage */}
        <div
          style={{
            flex: 1,
            minHeight: 460,
            maxHeight: '74vh',
            overflow: 'auto',
            background: '#020617',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            cursor: zoomLevel > 1 ? 'grab' : 'default',
          }}
        >
          {loading ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading high-definition image...</div>
          ) : (
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
                display: 'inline-block',
              }}
            >
              <img
                src={imageUrl}
                alt={title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '66vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                  border: '1.5px solid rgba(255,255,255,0.15)',
                  imageRendering: '-webkit-optimize-contrast',
                  display: 'block',
                }}
              />
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div
          style={{
            padding: '10px 20px',
            background: '#040711',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.72rem',
            color: '#64748b',
          }}
        >
          <div>
            Real-time Full HD Inspector · Crisp optical resolution with zero blur artifacts
          </div>
          <div>
            Click and drag or use zoom controls to inspect micro text &amp; stamps
          </div>
        </div>
      </div>
    </div>
  );
}
