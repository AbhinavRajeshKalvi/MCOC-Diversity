import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { EMBED_COOKIE } from "@/lib/auth";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display"
});
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const stat = JetBrains_Mono({ subsets: ["latin"], variable: "--font-stat" });

export const metadata: Metadata = {
  title: "War Room — Alliance Diversity Planner",
  description: "Roster and defender-diversity planning for Alliance Wars.",
  applicationName: "War Room",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }]
  },
  // Home-screen installs on iPhone open full screen, like an app.
  appleWebApp: { capable: true, title: "War Room", statusBarStyle: "black" }
};

export const viewport: Viewport = {
  themeColor: "#0D0F14"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Inside the mobile app the native tabs replace the web navigation.
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${stat.variable}`}
      data-embed={cookies().get(EMBED_COOKIE)?.value === "1" ? "1" : undefined}
    >
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
