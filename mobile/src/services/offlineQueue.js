// src/services/offlineQueue.js
// Task A6: Offline Resilience Queue with Idempotency Key
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import api from './api';

const QUEUE_KEY = '@homecare_offline_action_queue';

export const enqueueOfflineAction = async (endpoint, method, payload, idempotencyKey) => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const existingQueue = raw ? JSON.parse(raw) : [];
    const key = idempotencyKey || `ik-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const actionItem = {
      id: key,
      endpoint,
      method: (method || 'POST').toUpperCase(),
      payload,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };

    existingQueue.push(actionItem);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(existingQueue));
    console.log(`[OfflineQueue] Enqueued action ${key} for ${endpoint}`);
    return actionItem;
  } catch (e) {
    console.warn('[OfflineQueue] Enqueue error:', e);
  }
};

export const flushOfflineQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    if (!queue || queue.length === 0) return { success: true, count: 0 };

    console.log(`[OfflineQueue] Flushing ${queue.length} queued offline actions...`);
    const remaining = [];

    for (const item of queue) {
      try {
        await api({
          url: item.endpoint,
          method: item.method,
          data: item.payload,
          headers: { 'X-Idempotency-Key': item.id },
        });
        console.log(`[OfflineQueue] Successfully flushed action ${item.id}`);
      } catch (err) {
        // 409 Conflict means already recorded on backend; safe to discard
        if (err.response?.status === 409) {
          console.warn(`[OfflineQueue] Action ${item.id} already committed (409). Discarding.`);
          continue;
        }
        item.retryCount = (item.retryCount || 0) + 1;
        if (item.retryCount < 5) {
          remaining.push(item);
        } else {
          console.error(`[OfflineQueue] Action ${item.id} exceeded max retries. Dropping.`);
        }
      }
    }

    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return { success: true, remaining: remaining.length };
  } catch (e) {
    console.warn('[OfflineQueue] Flush error:', e);
  }
};

// Automatic listener on network restoration
export function initOfflineSyncListener() {
  try {
    NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        console.log('[OfflineQueue] Connection online. Triggering queue flush...');
        flushOfflineQueue();
      }
    });
  } catch (e) {
    console.warn('[OfflineQueue] NetInfo listener initialization note:', e.message);
  }
}

// Wrapper for resilient submission (Check-In, Check-Out, MAR, Daily Report)
export async function submitWithOfflineFallback(endpoint, method, payload, customKey = null) {
  const key = customKey || `ik-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  let isOffline = false;
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected || net.isInternetReachable === false) {
      isOffline = true;
    }
  } catch (e) {
    isOffline = false;
  }

  if (isOffline) {
    console.log(`[OfflineQueue] Device is offline. Enqueuing ${endpoint}`);
    await enqueueOfflineAction(endpoint, method, payload, key);
    return { success: true, offline: true, idempotencyKey: key, data: { status: 'queued_offline' } };
  }

  try {
    const res = await api({
      url: endpoint,
      method,
      data: payload,
      headers: { 'X-Idempotency-Key': key },
    });
    return { success: true, offline: false, idempotencyKey: key, data: res.data };
  } catch (err) {
    if (!err.response || err.code === 'ECONNABORTED' || err.message === 'Network Error') {
      console.log(`[OfflineQueue] Network failed during request. Enqueuing ${endpoint}`);
      await enqueueOfflineAction(endpoint, method, payload, key);
      return { success: true, offline: true, idempotencyKey: key, data: { status: 'queued_offline' } };
    }
    throw err;
  }
}

export const offlineQueue = {
  enqueueOfflineAction,
  flushOfflineQueue,
  initOfflineSyncListener,
  submitWithOfflineFallback,
};

export default offlineQueue;
