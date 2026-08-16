import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#fff3ee",
          100: "#ffe1d5",
          300: "#ffab8a",
          500: "#ff6b4a",
          600: "#f0563a",
          700: "#e8523a",
          900: "#8a2e1d",
        },
        slate: {
          200: "#c3c8d4",
          400: "#8b93a8",
          600: "#5b6274",
          800: "#2e3240",
        },
        ink: {
          DEFAULT: "#15110d",
          50: "#f5f1ea",
          800: "#1c1712",
          900: "#12100d",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "score-fill": "score-fill 1s ease-out forwards",
      },
      keyframes: {
        "score-fill": {
          "0%": { width: "0%" },
          "100%": { width: "var(--score-width)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
