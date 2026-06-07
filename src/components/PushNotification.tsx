"use client";

import { useState, useEffect, useCallback } from "react";

const PUSH_API = "https://chaser-push.isearover.workers.dev";

export default function PushNotification() {
  const [subscribed, setSubscribed] = useState(false);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window
    );
    // Check existing subscription
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setSubscribed(!!sub);
        });
      });
    }
  }, []);

  const subscribe = useCallback(async () => {
    setLoading(true);
    try {
      // Get VAPID public key from worker
      const res = await fetch(`${PUSH_API}/vapidPublicKey`);
      const { publicKey } = await res.json();

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to backend
      await fetch(`${PUSH_API}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      setSubscribed(true);
    } catch (e) {
      console.error("Push subscription failed:", e);
    }
    setLoading(false);
  }, []);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.error("Push unsubscription failed:", e);
    }
    setLoading(false);
  }, []);

  if (!supported) return null;

  return (
    <button
      onClick={subscribed ? unsubscribe : subscribe}
      disabled={loading}
      className={`text-sm font-medium py-2 px-3 rounded-lg transition-colors flex items-center gap-1.5 ${
        subscribed
          ? "bg-green-600/30 text-green-300 border border-green-500/30"
          : "bg-white/10 hover:bg-white/20 text-white"
      }`}
    >
      <span>{subscribed ? "🔔" : "🔕"}</span>
      <span>{loading ? "..." : subscribed ? "已訂閱" : "開啟通知"}</span>
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}
