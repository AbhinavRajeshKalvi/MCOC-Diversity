import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#14161C",
          panel: "#1B1E27",
          raised: "#22262F",
          line: "#31353F"
        },
        parchment: {
          DEFAULT: "#EDEBE4",
          dim: "#9CA0AC",
          faint: "#6C707B"
        },
        brass: {
          DEFAULT: "#C89B3C",
          bright: "#E0B75B",
          dim: "#8A6C2E"
        },
        crimson: {
          DEFAULT: "#A63446",
          bright: "#C24A5D"
        },
        teal: {
          DEFAULT: "#4C9A7F",
          bright: "#63B896"
        }
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        stat: ["var(--font-stat)"]
      }
    }
  },
  plugins: []
};

export default config;
