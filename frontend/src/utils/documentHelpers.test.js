import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDocumentFileClient,
  requestSignedDocumentDownloadUrl,
} from './documentHelpers.js';

test('validateDocumentFileClient allows pdf/jpg/png within 10MB and rejects invalid types/sizes', () => {
  assert.equal(validateDocumentFileClient({ name: 'report.pdf', size: 1024 }).valid, true);
  assert.equal(validateDocumentFileClient({ name: 'scan.png', size: 2048 }).valid, true);
  assert.equal(validateDocumentFileClient({ name: 'video.mp4', size: 1024 }).valid, false);
  assert.equal(validateDocumentFileClient({ name: 'huge.pdf', size: 11 * 1024 * 1024 }).valid, false);
});

test('requestSignedDocumentDownloadUrl calls POST download-link and returns signed URL', async () => {
  let calledUrl = '';
  let calledMethod = '';
  const mockFetch = async (url, opts) => {
    calledUrl = url;
    calledMethod = opts?.method;
    return {
      ok: true,
      json: async () => ({ url: 'https://example.com/api/documents/7/download/?dl=abc', expires_in: 60 }),
    };
  };
  const signedUrl = await requestSignedDocumentDownloadUrl(mockFetch, 7);
  assert.equal(calledUrl, '/documents/7/download-link/');
  assert.equal(calledMethod, 'POST');
  assert.equal(signedUrl, 'https://example.com/api/documents/7/download/?dl=abc');
});

