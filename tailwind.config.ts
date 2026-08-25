import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        // Calm control, sharply executed. Near-black actions + one calm blue accent.
        ink: "#111114", // primary text + primary buttons
        accent: {
          DEFAULT: "#2f5bea", // calm blue — links, active states, highlights (used sparingly)
          soft: "#eef2ff",
        },
      },
      borderRadius: {
        // sharp, not soft
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
