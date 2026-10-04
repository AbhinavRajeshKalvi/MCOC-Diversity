import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Gunmetal base with brass and ember accents: a war-room look.
        ink: {
          DEFAULT: "#0D0F14",
          panel: "#161920",
          raised: "#20232C",
          line: "#2F333F",
          lighter: "#474C5C"
        },
        parchment: {
          DEFAULT: "#EEF0F7",
          dim: "#A3A9C2",
          faint: "#6E7591"
        },
        brass: {
          DEFAULT: "#E0A93B",
          bright: "#F6C861",
          dim: "#9C7426"
        },
        crimson: {
          DEFAULT: "#C2364E",
          bright: "#F05A72"
        },
        teal: {
          DEFAULT: "#2FA88A",
          bright: "#4FD1A9"
        },
        // Champion class colors, used as accents across the app.
        cosmic: "#38BDF8",
        tech: "#60A5FA",
        mutant: "#FACC15",
        skill: "#F87171",
        science: "#4ADE80",
        mystic: "#C084FC"
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        stat: ["var(--font-stat)"]
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(246,200,97,0.35), 0 0 22px -4px rgba(246,200,97,0.45)"
      }
    }
  },
  plugins: []
};

export default config;
