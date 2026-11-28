export const ALLOWED_DOCUMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];
export const MAX_DOCUMENT_SIZE_MB = 10;

export function validateDocumentFileClient(file, maxMb = MAX_DOCUMENT_SIZE_MB) {
  if (!file || !file.name) {
    return { valid: false, error: 'Please select a file to upload.' };
  }
  const ext = String(file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file format (.${ext}). Allowed formats are PDF, JPG, JPEG, and PNG.`,
    };
  }
  if (typeof file.size === 'number' && file.size > maxMb * 1024 * 1024) {
    return {
      valid: false,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit of ${maxMb} MB.`,
    };
  }
  return { valid: true, error: '' };
}

export async function requestSignedDocumentDownloadUrl(apiFetchFn, docId) {
  const res = await apiFetchFn(`/documents/${docId}/download-link/`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to generate download link.');
  }
  const data = await res.json();
  if (!data?.url) {
    throw new Error('Download link missing from server response.');
  }
  return data.url;
}

