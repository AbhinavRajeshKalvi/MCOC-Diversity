import type { MetadataRoute } from "next";

// Lets phones add War Room to the home screen as an app. iOS only delivers web
// push to sites added this way.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "War Room",
    short_name: "War Room",
    description: "Alliance war planning: battlegroups, attack map, rosters and chat.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0D0F14",
    theme_color: "#0D0F14",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
