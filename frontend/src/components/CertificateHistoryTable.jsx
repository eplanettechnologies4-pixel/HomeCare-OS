import React, { useState, useMemo } from "react";
import {
  Award, Search, Filter, Download, FileText, ShieldCheck, ChevronLeft,
  ChevronRight, ArrowUpDown, Copy, Check, ExternalLink, RefreshCw
} from "lucide-react";
import useStore from "../store/useStore";

export default function CertificateHistoryTable({
  certificates = [],
  loading = false,
  onRefresh,
  onOpenGenerator,
  title = "Certificate History",
  subtitle = "Complete archive of official certificates issued across the organization",
  showRecipientColumn = true,
  itemsPerPageDefault = 10,
}) {
  const downloadCertificateById = useStore((s) => s.downloadCertificateById);

  // Search, filter & sort states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest"); // 'newest' | 'oldest' | 'name'
  const [copiedId, setCopiedId] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(itemsPerPageDefault);

  // Extract unique certificate types for the filter dropdown
  const certificateTypes = useMemo(() => {
    const set = new Set();
    certificates.forEach((c) => {
      if (c.title) set.add(c.title.trim());
    });
    return Array.from(set).sort();
  }, [certificates]);

  // Filter and sort certificates
  const processedCertificates = useMemo(() => {
    let result = [...certificates];

    // 1. Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter((c) => {
        const idMatch = (c.certificate_id || "").toLowerCase().includes(q);
        const nameMatch = (c.recipient_name || "").toLowerCase().includes(q);
        const titleMatch = (c.title || "").toLowerCase().includes(q);
        const courseMatch = (c.course_title || "").toLowerCase().includes(q);
        const adminMatch = (c.generated_by_name || "").toLowerCase().includes(q);
        return idMatch || nameMatch || titleMatch || courseMatch || adminMatch;
      });
    }

    // 2. Type filter
    if (selectedType !== "all") {
      result = result.filter((c) => (c.title || "").trim() === selectedType);
    }

    // 3. Sorting (default: newest first)
    result.sort((a, b) => {
      if (sortOrder === "newest") {
        const dateA = new Date(a.issue_date || 0).getTime();
        const dateB = new Date(b.issue_date || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
      }
      if (sortOrder === "oldest") {
        const dateA = new Date(a.issue_date || 0).getTime();
        const dateB = new Date(b.issue_date || 0).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return (a.id || 0) - (b.id || 0);
      }
      if (sortOrder === "name") {
        return (a.recipient_name || "").localeCompare(b.recipient_name || "");
      }
      return 0;
    });

    return result;
  }, [certificates, searchTerm, selectedType, sortOrder]);

  // Pagination calculations
  const totalItems = processedCertificates.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const validPage = Math.min(currentPage, totalPages);

  const paginatedCertificates = useMemo(() => {
    const startIndex = (validPage - 1) * itemsPerPage;
    return processedCertificates.slice(startIndex, startIndex + itemsPerPage);
  }, [processedCertificates, validPage, itemsPerPage]);

  const handleCopyId = (certId) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(certId);
      setCopiedId(certId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="certificate-history-container" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Toolbar: Search, Filters, Sorters & Actions ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1, minWidth: 320 }}>
          {/* Search Box */}
          <div style={{ position: "relative", minWidth: 260, flex: 1, maxWidth: 380 }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--status-grey)",
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 34, height: 38, fontSize: "0.84rem" }}
              placeholder="Search by ID, recipient, course, title…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--status-grey)",
                  fontSize: "0.8rem",
                  padding: 2,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Certificate Type Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Filter size={13} color="var(--status-grey)" />
            <select
              className="form-select"
              style={{ height: 38, fontSize: "0.82rem", minWidth: 160 }}
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">All Certificate Types</option>
              {certificateTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Order */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ArrowUpDown size={13} color="var(--status-grey)" />
            <select
              className="form-select"
              style={{ height: 38, fontSize: "0.82rem", minWidth: 140 }}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Recipient (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Right side: Count & Optional Generator Button */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onRefresh && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onRefresh}
              title="Refresh certificate list"
              disabled={loading}
              style={{ height: 36 }}
            >
              <RefreshCw size={13} className={loading ? "spin" : ""} />
            </button>
          )}

          <div style={{ fontSize: "0.8rem", color: "var(--status-grey)", whiteSpace: "nowrap" }}>
            <strong>{totalItems}</strong> certificate{totalItems !== 1 ? "s" : ""}
          </div>

          {onOpenGenerator && (
            <button
              type="button"
              className="btn btn-primary"
              style={{
                background: "#5B1A4A",
                borderColor: "#5B1A4A",
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 38,
                fontSize: "0.84rem",
                padding: "0 14px",
              }}
              onClick={onOpenGenerator}
            >
              <Award size={14} color="#D4A94A" /> Generate Certificate
            </button>
          )}
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--sage-200)" }}>
        {paginatedCertificates.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--status-grey)" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "#5B1A4A15",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
              }}
            >
              <Award size={26} color="#5B1A4A" />
            </div>
            <div style={{ fontWeight: 700, color: "var(--teal-900)", fontSize: "1.05rem", marginBottom: 4 }}>
              {searchTerm || selectedType !== "all" ? "No Matching Certificates" : "No Certificates Issued Yet"}
            </div>
            <p style={{ fontSize: "0.82rem", maxWidth: 380, margin: "0 auto 16px" }}>
              {searchTerm || selectedType !== "all"
                ? "Try adjusting your search criteria or resetting the filters to view all certificates."
                : "Official certificates generated manually or through LMS course completions will be recorded here with instant verification."}
            </p>
            {searchTerm || selectedType !== "all" ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedType("all");
                }}
              >
                Clear Filters
              </button>
            ) : onOpenGenerator ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ background: "#5B1A4A", borderColor: "#5B1A4A" }}
                onClick={onOpenGenerator}
              >
                <Award size={13} color="#D4A94A" /> Generate First Certificate
              </button>
            ) : null}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", margin: 0 }}>
              <thead>
                <tr style={{ background: "var(--sage-50)", borderBottom: "1px solid var(--sage-200)" }}>
                  <th style={{ padding: "12px 14px", width: 170 }}>Certificate ID</th>
                  {showRecipientColumn && <th style={{ padding: "12px 14px" }}>Recipient</th>}
                  <th style={{ padding: "12px 14px" }}>Certificate Type / Title</th>
                  <th style={{ padding: "12px 14px", width: 120 }}>Issue Date</th>
                  <th style={{ padding: "12px 14px" }}>Linked Course</th>
                  <th style={{ padding: "12px 14px", width: 130 }}>Issued By</th>
                  <th style={{ padding: "12px 14px", textAlign: "right", minWidth: 200 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCertificates.map((cert) => {
                  const certId = cert.certificate_id || cert.certificate_number;
                  const isCopied = copiedId === certId;
                  const hasCourse = Boolean(cert.course_title);

                  return (
                    <tr key={cert.id} style={{ borderBottom: "1px solid var(--sage-100)" }}>
                      {/* 1. Certificate ID */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontWeight: 700,
                              color: "#5B1A4A",
                              fontSize: "0.82rem",
                              background: "#5B1A4A10",
                              padding: "3px 7px",
                              borderRadius: 4,
                              letterSpacing: "0.02em",
                            }}
                          >
                            {certId}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyId(certId)}
                            title={isCopied ? "Copied!" : "Copy Certificate ID"}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 2,
                              cursor: "pointer",
                              color: isCopied ? "var(--status-green)" : "var(--status-grey)",
                            }}
                          >
                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>

                      {/* 2. Recipient Name & Role (if enabled) */}
                      {showRecipientColumn && (
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ fontWeight: 700, color: "var(--teal-900)", fontSize: "0.88rem" }}>
                            {cert.recipient_name || cert.staff_name || "—"}
                          </div>
                          {cert.staff_role && (
                            <div style={{ fontSize: "0.72rem", color: "var(--status-grey)", marginTop: 1 }}>
                              <span className="badge badge-grey" style={{ fontSize: "0.68rem", padding: "1px 6px" }}>
                                {cert.staff_role}
                              </span>
                            </div>
                          )}
                        </td>
                      )}

                      {/* 3. Certificate Type / Title */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            className="badge"
                            style={{
                              background: "#FCFBF9",
                              border: "1px solid #D4A94A",
                              color: "#5B1A4A",
                              fontWeight: 700,
                              fontSize: "0.78rem",
                              padding: "4px 8px",
                              borderRadius: 6,
                            }}
                          >
                            {cert.title}
                          </span>
                        </div>
                      </td>

                      {/* 4. Issue Date */}
                      <td style={{ padding: "12px 14px", fontSize: "0.8rem", color: "var(--teal-800)" }}>
                        {cert.issue_date || "—"}
                      </td>

                      {/* 5. Linked Course */}
                      <td style={{ padding: "12px 14px" }}>
                        {hasCourse ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                fontSize: "0.82rem",
                                fontWeight: 600,
                                color: "var(--teal-800)",
                                maxWidth: 220,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={cert.course_title}
                            >
                              {cert.course_title}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.78rem", color: "var(--status-grey)" }}>—</span>
                        )}
                      </td>

                      {/* 6. Issued By */}
                      <td style={{ padding: "12px 14px", fontSize: "0.8rem", color: "var(--status-grey)" }}>
                        {cert.generated_by_name || "System Admin"}
                      </td>

                      {/* 7. Actions: View, Download, QR Link */}
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                          {/* View PDF Inline */}
                          <a
                            href={cert.pdf_url || `/api/lms/certificates/${cert.id}/download/`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: "0.74rem", padding: "4px 8px", gap: 4 }}
                            title="View official certificate PDF inline"
                          >
                            <FileText size={12} /> View
                          </a>

                          {/* Download PDF */}
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: "0.74rem", padding: "4px 8px", gap: 4 }}
                            onClick={() => downloadCertificateById(cert.id, certId)}
                            title="Download print-ready A4 PDF"
                          >
                            <Download size={12} /> Download
                          </button>

                          {/* Public QR Verification Link */}
                          <a
                            href={`/verify-certificate/${certId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                            style={{
                              fontSize: "0.74rem",
                              padding: "4px 8px",
                              gap: 4,
                              color: "var(--status-green)",
                              borderColor: "rgba(16, 185, 129, 0.2)",
                            }}
                            title="Test public QR verification"
                          >
                            <ShieldCheck size={13} /> Verify
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination Footer ── */}
        {totalItems > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              background: "var(--sage-50)",
              borderTop: "1px solid var(--sage-200)",
              fontSize: "0.8rem",
              color: "var(--status-grey)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span>
                Showing <strong>{Math.min(totalItems, (validPage - 1) * itemsPerPage + 1)}</strong> to{" "}
                <strong>{Math.min(totalItems, validPage * itemsPerPage)}</strong> of <strong>{totalItems}</strong> entries
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span>Rows:</span>
                <select
                  className="form-select"
                  style={{ height: 28, padding: "2px 8px", fontSize: "0.75rem", width: 64 }}
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "4px 8px" }}
                  disabled={validPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Prev
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    if (totalPages <= 7) return true;
                    if (page === 1 || page === totalPages) return true;
                    return Math.abs(page - validPage) <= 1;
                  })
                  .map((page, idx, arr) => {
                    const prev = arr[idx - 1];
                    return (
                      <React.Fragment key={page}>
                        {prev && page - prev > 1 && <span style={{ padding: "0 4px" }}>…</span>}
                        <button
                          type="button"
                          className={`btn btn-sm ${validPage === page ? "btn-primary" : "btn-ghost"}`}
                          style={{
                            minWidth: 28,
                            height: 28,
                            padding: "0 6px",
                            background: validPage === page ? "#5B1A4A" : undefined,
                            borderColor: validPage === page ? "#5B1A4A" : undefined,
                          }}
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "4px 8px" }}
                  disabled={validPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
