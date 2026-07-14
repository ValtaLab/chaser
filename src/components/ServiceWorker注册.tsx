'use client';

import { useEffect } from 'react';

// Module-level callback for update notifications
let onUpdateAvailableCallback: (() => void) | null = null;

export function setOnUpdateAvailable(cb: (() => void) | null) {
  onUpdateAvailableCallback = cb;
}

const WORKER_URL = 'https://chaser-auth.isearover.workers.dev';
const VAPID_PUBLIC_KEY = 'BAjzSqYCsNCmz4VWRi0xUfH5GIYsWGUQsWg5WOGhJH31cv1up65gxn0et2WA0PYmTECYlZp6rVY5GKYRJ2KbPyo';

/** Subscribe to push notifications and send subscription to worker */
export async function subscribePush(registration?: ServiceWorkerRegistration) {
  if (!registration) {
    if (!('serviceWorker' in navigator)) return false;
    registration = await navigator.serviceWorker.ready;
  }

  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Already subscribed — verify it's still valid
      const ok = await fetch(`${WORKER_URL}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: existing.toJSON() }),
      });
      if (ok.ok) return true;
      // If subscribe endpoint fails (e.g. subscription expired), unsubscribe and re-subscribe
      await existing.unsubscribe();
    }

    // Convert VAPID public key to Uint8Array for subscribe()
    const keyBytes = Uint8Array.from(
      atob(VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0)
    );

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes,
    });

    // Send to worker
    await fetch(`${WORKER_URL}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    console.log('[Push] Subscribed successfully');
    return true;
  } catch (err) {
    // iOS 16.4+ PWA supports push, but older iOS or non-PWA may not
    console.log('[Push] Subscription not available:', err);
    return false;
  }
}

export default function ServiceWorker注册() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          registration.update();

          // Subscribe to push notifications after registration
          subscribePush(registration);

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated') {
                  if (onUpdateAvailableCallback) {
                    onUpdateAvailableCallback();
                  } else {
                    window.location.reload();
                  }
                }
              });
            }
          });
        })
        .catch((err) => {
          console.error('SW registration failed:', err);
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }, []);

  return null;
}
