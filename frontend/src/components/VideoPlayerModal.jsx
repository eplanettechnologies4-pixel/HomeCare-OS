import React, { useState, useEffect, useRef } from "react";
import { Video, X, CheckCircle, Clock } from "lucide-react";
import useStore from "../store/useStore";

function fmtDuration(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function VideoPlayerModal({ lecture, assignment, onClose, onProgressUpdated }) {
  const videoRef = useRef(null);
  const pingInterval = useRef(null);
  const postLectureProgress = useStore((s) => s.postLectureProgress);
  const [progressResult, setProgressResult] = useState(null);

  useEffect(() => {
    // Ping every 30 seconds while playing — mirrors GPS ping architecture
    pingInterval.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || !assignment) return;
      const pct = v.duration ? (v.currentTime / v.duration) * 100 : 0;
      postLectureProgress(lecture.id, Math.floor(v.currentTime), pct, assignment.staff_id || null)
        .then((r) => {
          if (r && r.success) {
            setProgressResult(r.data);
            if (onProgressUpdated) onProgressUpdated(r.data);
          }
        });
    }, 30000);
    return () => clearInterval(pingInterval.current);
  }, [lecture.id, assignment, postLectureProgress, onProgressUpdated]);

  const handleEnded = () => {
    const v = videoRef.current;
    if (!v || !assignment) return;
    postLectureProgress(lecture.id, Math.floor(v.duration || 0), 100, assignment.staff_id || null)
      .then((r) => {
        if (r && r.success) {
          setProgressResult(r.data);
          if (onProgressUpdated) onProgressUpdated(r.data);
        }
      });
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 680, maxWidth: "96vw" }}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--teal-800)" }}>{lecture.title}</div>
            {progressResult?.completed && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <CheckCircle size={14} color="var(--status-green)" />
                <span style={{ fontSize: "0.78rem", color: "var(--status-green)", fontWeight: 600 }}>Lecture marked complete!</span>
              </div>
            )}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          {lecture.video_source ? (
            <video
              ref={videoRef}
              src={lecture.video_source}
              controls
              autoPlay
              style={{ width: "100%", maxHeight: 380, background: "#000", display: "block" }}
              onEnded={handleEnded}
            />
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--status-grey)" }}>
              <Video size={44} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <p style={{ margin: 0, fontWeight: 500 }}>No video source available for this lecture.</p>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--status-grey)" }}>
            Progress auto-saved every 30 seconds · Duration: {fmtDuration(lecture.duration_seconds)}
          </span>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
