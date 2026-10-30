import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, X, RefreshCw, Check, AlertCircle, Sparkles, SwitchCamera,
  CreditCard, User, Maximize2, RotateCcw
} from 'lucide-react';

export default function RealtimeCameraModal({
  isOpen,
  onClose,
  onCapture,
  mode = 'square', // 'square' (for profile DP) | 'id_card' (for CNIC front/back)
  title = 'Real-Time Full HD Camera Capture',
  targetSide = null, // 'front' | 'back' (if mode === 'id_card')
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [streamActive, setStreamActive] = useState(false);
  const [streamResolution, setStreamResolution] = useState({ width: 0, height: 0, label: 'Initializing...' });
  const [facingMode, setFacingMode] = useState(mode === 'id_card' ? 'environment' : 'user'); // environment default for cards
  const [capturedImage, setCapturedImage] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Stop camera helper
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStreamActive(false);
  }, []);

  // Start Real-Time Full HD camera
  const startCamera = useCallback(async (selectedFacingMode) => {
    stopStream();
    setErrorMsg('');
    setCapturedImage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Camera access is not supported by your browser or environment.');
      return;
    }

    try {
      // Request Full HD 1080p constraints with fallback to 720p HD
      const constraints = {
        audio: false,
        video: {
          facingMode: selectedFacingMode,
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Read real-time track capabilities & actual settings
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
      const actualWidth = settings.width || 1920;
      const actualHeight = settings.height || 1080;

      let qualityLabel = 'Full HD (1080p)';
      if (actualWidth >= 3840 || actualHeight >= 2160) {
        qualityLabel = 'Ultra HD (4K)';
      } else if (actualWidth >= 1920 || actualHeight >= 1080) {
        qualityLabel = 'Full HD (1080p)';
      } else if (actualWidth >= 1280 || actualHeight >= 720) {
        qualityLabel = 'High Definition (720p)';
      } else {
        qualityLabel = 'Standard Resolution';
      }

      setStreamResolution({
        width: actualWidth,
        height: actualHeight,
        label: qualityLabel,
      });

      setStreamActive(true);
    } catch (err) {
      console.warn('Real-time camera error:', err);
      // Fallback attempt without strict width/height constraints
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: selectedFacingMode },
        });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play();
        }
        setStreamResolution({ width: 1280, height: 720, label: 'HD 720p Fallback' });
        setStreamActive(true);
      } catch (fallbackErr) {
        setErrorMsg('Camera access denied or unavailable. Please ensure camera permissions are granted in your browser settings.');
      }
    }
  }, [stopStream]);

  // Handle open/close
  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopStream();
      setCapturedImage(null);
    }
    return () => {
      stopStream();
    };
  }, [isOpen, startCamera, stopStream, facingMode]);

  // Toggle front/back camera
  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture Full HD snapshot
  const handleCapture = () => {
    if (!videoRef.current || !streamActive) return;
    setIsProcessing(true);

    const video = videoRef.current;
    const vWidth = video.videoWidth || 1920;
    const vHeight = video.videoHeight || 1080;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });

    if (mode === 'square') {
      // 1:1 Square crop from the center of the video frame
      const minDim = Math.min(vWidth, vHeight);
      canvas.width = minDim;
      canvas.height = minDim;

      const sx = (vWidth - minDim) / 2;
      const sy = (vHeight - minDim) / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, minDim, minDim);
    } else {
      // ID Card crop (~ 1.586 : 1 ratio standard CR-80)
      const targetRatio = 1.586;
      let cropWidth = vWidth * 0.85;
      let cropHeight = cropWidth / targetRatio;

      if (cropHeight > vHeight * 0.85) {
        cropHeight = vHeight * 0.85;
        cropWidth = cropHeight * targetRatio;
      }

      canvas.width = Math.round(cropWidth);
      canvas.height = Math.round(cropHeight);

      const sx = (vWidth - cropWidth) / 2;
      const sy = (vHeight - cropHeight) / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, sx, sy, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    }

    // Export in high quality 96% JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.96);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setIsProcessing(false);
          return;
        }

        const fileName = `${mode === 'square' ? 'staff_dp' : `id_card_${targetSide || 'photo'}`}_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });

        setCapturedImage({
          dataUrl,
          file,
          width: canvas.width,
          height: canvas.height,
          quality: `${canvas.width} × ${canvas.height} px · Full HD Real-Time`,
        });

        setIsProcessing(false);
      },
      'image/jpeg',
      0.96
    );
  };

  const handleRetake = () => {
    setCapturedImage(null);
    if (!streamActive) {
      startCamera(facingMode);
    }
  };

  const handleConfirm = () => {
    if (!capturedImage) return;
    onCapture({
      file: capturedImage.file,
      dataUrl: capturedImage.dataUrl,
      width: capturedImage.width,
      height: capturedImage.height,
      mode,
    });
    stopStream();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 10000, background: 'rgba(7, 11, 22, 0.88)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal"
        style={{
          width: 680,
          maxWidth: '96vw',
          background: '#0f172a',
          color: '#f8fafc',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
          border: '1.5px solid rgba(253, 224, 71, 0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(90deg, #1e1b4b 0%, #0f172a 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #FDE047 0%, #D97706 100%)',
                color: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Camera size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.98rem', letterSpacing: '0.3px', color: '#fff' }}>
                {title}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: streamActive ? '#22c55e' : '#ef4444' }} />
                <span>{streamActive ? `Real-Time Live · ${streamResolution.label}` : 'Connecting Video Stream...'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {streamActive && !capturedImage && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleToggleFacingMode}
                style={{ color: '#FDE047', borderColor: 'rgba(253, 224, 71, 0.3)', fontSize: '0.74rem', padding: '4px 10px' }}
                title="Switch Camera (Front / Back)"
              >
                <SwitchCamera size={14} /> Flip Camera
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onClose}
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
              aria-label="Close camera"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Viewfinder / Capture Canvas Container */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 420,
            background: '#020617',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {errorMsg ? (
            <div style={{ textAlign: 'center', padding: 24, maxWidth: 420, color: '#f87171' }}>
              <AlertCircle size={44} style={{ margin: '0 auto 12px', opacity: 0.8 }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>Camera Unavailable</div>
              <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 16px' }}>
                {errorMsg}
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => startCamera(facingMode)}
              >
                <RefreshCw size={14} /> Retry Camera Access
              </button>
            </div>
          ) : capturedImage ? (
            /* Snapshot Review View */
            <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={capturedImage.dataUrl}
                alt="Captured Snapshot"
                style={{
                  maxWidth: '92%',
                  maxHeight: '90%',
                  objectFit: 'contain',
                  borderRadius: mode === 'square' ? 10 : 8,
                  border: '2px solid #22c55e',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
                  imageRendering: 'crisp-edges',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  left: 14,
                  background: 'rgba(0,0,0,0.75)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: '0.72rem',
                  color: '#22c55e',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Check size={13} /> Full HD Snapshot Captured ({capturedImage.quality})
              </div>
            </div>
          ) : (
            /* Live Stream View */
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                }}
              />

              {/* High-Tech Framing Overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {mode === 'square' ? (
                  /* 1:1 Square Profile DP Framing Guide */
                  <div
                    style={{
                      width: 270,
                      height: 270,
                      borderRadius: 12,
                      border: '2px dashed #FDE047',
                      boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.55)',
                      position: 'relative',
                    }}
                  >
                    {/* Viewfinder Corners */}
                    <div style={{ position: 'absolute', top: -3, left: -3, width: 22, height: 22, borderTop: '4px solid #FDE047', borderLeft: '4px solid #FDE047' }} />
                    <div style={{ position: 'absolute', top: -3, right: -3, width: 22, height: 22, borderTop: '4px solid #FDE047', borderRight: '4px solid #FDE047' }} />
                    <div style={{ position: 'absolute', bottom: -3, left: -3, width: 22, height: 22, borderBottom: '4px solid #FDE047', borderLeft: '4px solid #FDE047' }} />
                    <div style={{ position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderBottom: '4px solid #FDE047', borderRight: '4px solid #FDE047' }} />
                    
                    {/* Center Head Target Guide */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 70,
                        height: 70,
                        borderRadius: '50%',
                        border: '1px dotted rgba(253, 224, 71, 0.4)',
                      }}
                    />

                    <div
                      style={{
                        position: 'absolute',
                        bottom: -28,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        background: 'rgba(0,0,0,0.7)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: '0.68rem',
                        color: '#FDE047',
                        fontWeight: 600,
                      }}
                    >
                      1:1 Square DP Guide · Full HD
                    </div>
                  </div>
                ) : (
                  /* CR-80 Standard ID Card Guide */
                  <div
                    style={{
                      width: 410,
                      maxWidth: '85vw',
                      height: 258,
                      borderRadius: 10,
                      border: '2px dashed #FDE047',
                      boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.6)',
                      position: 'relative',
                    }}
                  >
                    {/* Viewfinder Corners */}
                    <div style={{ position: 'absolute', top: -3, left: -3, width: 26, height: 26, borderTop: '4px solid #FDE047', borderLeft: '4px solid #FDE047' }} />
                    <div style={{ position: 'absolute', top: -3, right: -3, width: 26, height: 26, borderTop: '4px solid #FDE047', borderRight: '4px solid #FDE047' }} />
                    <div style={{ position: 'absolute', bottom: -3, left: -3, width: 26, height: 26, borderBottom: '4px solid #FDE047', borderLeft: '4px solid #FDE047' }} />
                    <div style={{ position: 'absolute', bottom: -3, right: -3, width: 26, height: 26, borderBottom: '4px solid #FDE047', borderRight: '4px solid #FDE047' }} />

                    <div
                      style={{
                        position: 'absolute',
                        bottom: -28,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        background: 'rgba(0,0,0,0.7)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: '0.68rem',
                        color: '#FDE047',
                        fontWeight: 600,
                      }}
                    >
                      {targetSide === 'back' ? 'Align National ID Card (Back Side)' : 'Align National ID Card (Front Side)'}
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time Quality Badge Overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  background: 'rgba(0,0,0,0.65)',
                  backdropFilter: 'blur(4px)',
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: '0.68rem',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Sparkles size={12} color="#FDE047" />
                <span style={{ fontFamily: 'var(--font-mono)' }}>{streamResolution.width} × {streamResolution.height}</span>
              </div>
            </>
          )}
        </div>

        {/* Footer Controls */}
        <div
          style={{
            padding: '16px 20px',
            background: '#090d16',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {capturedImage
              ? 'Inspect image quality above. Click Confirm to attach.'
              : mode === 'square'
              ? 'Center subject in square box for crisp 1:1 HD resolution.'
              : 'Hold ID card steady and flat to prevent glare and motion blur.'}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {capturedImage ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleRetake}
                  style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)', fontSize: '0.82rem' }}
                >
                  <RotateCcw size={14} /> Retake Photo
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirm}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Check size={16} /> Use Full HD Photo
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={onClose}
                  style={{ color: '#cbd5e1', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCapture}
                  disabled={!streamActive || isProcessing}
                  style={{
                    background: 'linear-gradient(135deg, #FDE047 0%, #D97706 100%)',
                    color: '#000',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    padding: '8px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)',
                  }}
                >
                  <Camera size={16} /> {isProcessing ? 'Processing Full HD...' : 'Capture Full HD Photo'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
