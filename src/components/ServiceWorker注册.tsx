"use client";

import { useEffect } from "react";

export default function ServiceWorker注册() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[SW] registered:", reg.scope);
          // Check for updates every 60 min
          setInterval(() => reg.update(), 60 * 60 * 1000);
        })
        .catch((err) => console.error("[SW] registration failed:", err));
    }
  }, []);

  return null;
}
