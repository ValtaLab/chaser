'use client';

import { useEffect } from 'react';

// Module-level callback for update notifications
let onUpdateAvailableCallback: (() => void) | null = null;

export function setOnUpdateAvailable(cb: (() => void) | null) {
  onUpdateAvailableCallback = cb;
}

export default function ServiceWorker注册() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          registration.update();

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
