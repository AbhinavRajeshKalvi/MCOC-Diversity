"use client";

import { useEffect } from "react";

// Registers the service worker that shows push notifications. The mobile
// app's web views can't use web push, so it's skipped there.
export default function ServiceWorker() {
  useEffect(() => {
    // The launch screen opens pages with "__s=1"; tidy it out of the address.
    const url = new URL(window.location.href);
    if (url.searchParams.has("__s")) {
      url.searchParams.delete("__s");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    if (!("serviceWorker" in navigator) || document.documentElement.dataset.embed) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker failed to register:", err));
  }, []);
  return null;
}
