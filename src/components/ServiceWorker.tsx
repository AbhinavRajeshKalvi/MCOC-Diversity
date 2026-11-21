"use client";

import { useEffect } from "react";

// Registers the service worker that shows push notifications. The mobile
// app's web views can't use web push, so it's skipped there.
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || document.documentElement.dataset.embed) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker failed to register:", err));
  }, []);
  return null;
}
