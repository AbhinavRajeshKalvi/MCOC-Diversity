import type { Metadata } from "next";
import { Barlow_Condensed, Inter, JetBrains_Mono } from "next/font/google";
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
  description: "Roster and defender-diversity planning for Alliance Wars."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${stat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
