/**
 * System Optimizer & 1-Click Cache/Cookie Cleaner for Dukaan Khaata
 * Instantly eliminates lag, browser freezing and memory accumulation.
 */

export interface CleanResult {
  cachesDeleted: number;
  cookiesCleared: number;
  serviceWorkersUnregistered: number;
}

export const clearAppCacheAndBoostSpeed = async (options?: { fullWipe?: boolean }): Promise<CleanResult> => {
  const result: CleanResult = {
    cachesDeleted: 0,
    cookiesCleared: 0,
    serviceWorkersUnregistered: 0
  };

  // 1. Cancel speech synthesis & free audio memory immediately
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {}

  // 2. Clear CacheStorage (PWA and Vite bundle static asset caches)
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
        result.cachesDeleted++;
      }
    }
  } catch (err) {
    console.warn('CacheStorage clear error:', err);
  }

  // 3. Unregister stale Service Workers to prevent frozen background loop threads
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
        result.serviceWorkersUnregistered++;
      }
    }
  } catch (err) {
    console.warn('Service worker unregister error:', err);
  }

  // 4. Clear document Cookies
  try {
    if (typeof document !== 'undefined' && document.cookie) {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        if (name) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
          result.cookiesCleared++;
        }
      }
    }
  } catch (err) {
    console.warn('Cookie clear error:', err);
  }

  // 5. Clear sessionStorage
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  } catch {}

  // 6. Clean LocalStorage Caches (or full wipe if requested)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (options?.fullWipe) {
        window.localStorage.clear();
      } else {
        // Retain essential owner credentials so user isn't logged out unexpectedly
        const preservedKeys = ['owner_pin', 'soundbox_enabled', 'app_lang', 'dukaan_theme', 'dukaan_shop_id'];
        const preservedData: Record<string, string> = {};
        for (const k of preservedKeys) {
          const val = localStorage.getItem(k);
          if (val !== null) preservedData[k] = val;
        }

        // Wipe all transient, image and offline caches
        localStorage.clear();

        // Restore preserved keys
        for (const [k, v] of Object.entries(preservedData)) {
          localStorage.setItem(k, v);
        }
      }
    }
  } catch (err) {
    console.warn('LocalStorage clear error:', err);
  }

  return result;
};
