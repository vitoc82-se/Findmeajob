import type { Config } from "tailwindcss";

// See DESIGN.md: warm, human, Swedish-daylight. Leaf green + butter-yellow stamps on warm paper.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#1D2B24", // text
        brand: { DEFAULT: "#1E6B52", dark: "#175440" }, // primary actions
        accent: { DEFAULT: "#1E6B52", soft: "#E4F1E8" }, // links, selected states
        sun: { DEFAULT: "#FFD25A", soft: "#F3E6BE" }, // score stamps
        paper: "#FBF8F3",
        mint: { DEFAULT: "#E4F1E8", border: "#C9D8CD" },
      },
      borderRadius: {
        DEFAULT: "12px", // inputs
        md: "12px",
        lg: "16px", // result rows
        xl: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
