/**
 * Offline Sync & IndexedDB Engine for Dukaan Khaata
 * - Multi-tenant aware: Caches customers, products, settings locally keyed by shop_id
 * - Buffers offline actions (e.g. add transaction, add customer, update rate)
 * - Automatically syncs with server when Internet or Local Hotspot connects
 */

export interface SyncQueueItem {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body: any;
  timestamp: number;
  description: string;
  shop_id?: number;
}

const SYNC_QUEUE_KEY = 'dukaan_offline_sync_queue';
const CACHE_CUSTOMERS_KEY = 'dukaan_cache_customers';
const CACHE_PRODUCTS_KEY = 'dukaan_cache_products';
const CACHE_SETTINGS_KEY = 'dukaan_cache_settings';

function getScopedKey(baseKey: string): string {
  if (typeof window === 'undefined') return baseKey;
  const shopId =
    localStorage.getItem('dukaan_shop_id') ||
    sessionStorage.getItem('dukaan_shop_id') ||
    '1';
  return `${baseKey}_shop_${shopId}`;
}

export const OfflineSyncEngine = {
  // Get all pending actions in queue
  getQueue(): SyncQueueItem[] {
    try {
      const raw = localStorage.getItem(SYNC_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  // Save queue
  setQueue(queue: SyncQueueItem[]) {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to save sync queue:', e);
    }
  },

  // Enqueue an action when offline
  enqueue(url: string, method: 'POST' | 'PUT' | 'DELETE', body: any, description: string): SyncQueueItem {
    const queue = this.getQueue();
    const shopId = parseInt(
      localStorage.getItem('dukaan_shop_id') || sessionStorage.getItem('dukaan_shop_id') || '1',
      10
    );
    const item: SyncQueueItem = {
      id: 'sync_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      url,
      method,
      body,
      timestamp: Date.now(),
      description,
      shop_id: shopId
    };
    queue.push(item);
    this.setQueue(queue);
    return item;
  },

  // Cache data locally for offline instant reads (Scoped per Shop ID)
  saveLocalCache(customers?: any[], products?: any[], settings?: any) {
    try {
      const cKey = getScopedKey(CACHE_CUSTOMERS_KEY);
      const pKey = getScopedKey(CACHE_PRODUCTS_KEY);
      const sKey = getScopedKey(CACHE_SETTINGS_KEY);

      if (customers) localStorage.setItem(cKey, JSON.stringify(customers));
      if (products) localStorage.setItem(pKey, JSON.stringify(products));
      if (settings) localStorage.setItem(sKey, JSON.stringify(settings));
    } catch (e) {
      console.warn('Cache write failed (storage limit?):', e);
    }
  },

  getLocalCache() {
    try {
      const cKey = getScopedKey(CACHE_CUSTOMERS_KEY);
      const pKey = getScopedKey(CACHE_PRODUCTS_KEY);
      const sKey = getScopedKey(CACHE_SETTINGS_KEY);

      const customers = JSON.parse(localStorage.getItem(cKey) || '[]');
      const products = JSON.parse(localStorage.getItem(pKey) || '[]');
      const settings = JSON.parse(localStorage.getItem(sKey) || 'null');
      return { customers, products, settings };
    } catch {
      return { customers: [], products: [], settings: null };
    }
  },

  // Clear current shop's local cache
  clearLocalCache() {
    try {
      const cKey = getScopedKey(CACHE_CUSTOMERS_KEY);
      const pKey = getScopedKey(CACHE_PRODUCTS_KEY);
      const sKey = getScopedKey(CACHE_SETTINGS_KEY);

      localStorage.removeItem(cKey);
      localStorage.removeItem(pKey);
      localStorage.removeItem(sKey);

      // Also clean legacy non-scoped keys
      localStorage.removeItem(CACHE_CUSTOMERS_KEY);
      localStorage.removeItem(CACHE_PRODUCTS_KEY);
      localStorage.removeItem(CACHE_SETTINGS_KEY);
    } catch (e) {
      console.warn('Error clearing cache:', e);
    }
  },

  // Run synchronization of all queued items to server
  async processSyncQueue(onProgress?: (syncedCount: number, total: number) => void): Promise<{ success: boolean; synced: number; remaining: number }> {
    const queue = this.getQueue();
    if (queue.length === 0) {
      return { success: true, synced: 0, remaining: 0 };
    }

    const total = queue.length;
    let synced = 0;
    const remainingQueue: SyncQueueItem[] = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json'
          },
          body: item.body ? JSON.stringify(item.body) : undefined
        });

        if (response.ok) {
          synced++;
          if (onProgress) onProgress(synced, total);
        } else {
          remainingQueue.push(item);
        }
      } catch {
        remainingQueue.push(item);
      }
    }

    this.setQueue(remainingQueue);
    return {
      success: remainingQueue.length === 0,
      synced,
      remaining: remainingQueue.length
    };
  }
};
