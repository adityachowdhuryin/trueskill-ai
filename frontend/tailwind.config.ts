import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition:  "400px 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(79,70,229,0.4)" },
          "50%":       { boxShadow: "0 0 20px 6px rgba(79,70,229,0.4)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-16px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "scale-pop": {
          "0%":  { opacity: "0", transform: "scale(0.85)" },
          "70%": { transform: "scale(1.04)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%":       { backgroundPosition: "100% 50%" },
        },
        orbit: {
          from: { transform: "rotate(0deg) translateX(40px) rotate(0deg)" },
          to:   { transform: "rotate(360deg) translateX(40px) rotate(-360deg)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "ping-slow": {
          "0%":         { transform: "scale(1)", opacity: "0.6" },
          "80%, 100%":  { transform: "scale(2)", opacity: "0" },
        },
        "confetti-drop": {
          "0%":   { transform: "translateY(-20px) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(60px) rotate(720deg)", opacity: "0" },
        },
      },
      animation: {
        shimmer:         "shimmer 1.6s ease-in-out infinite",
        float:           "float 3s ease-in-out infinite",
        "glow-pulse":    "glow-pulse 2s ease-in-out infinite",
        "slide-up":      "slide-up 0.5s ease both",
        "slide-up-fast": "slide-up 0.3s ease both",
        "slide-in-left":  "slide-in-left 0.3s ease both",
        "slide-in-right": "slide-in-right 0.3s ease both",
        "scale-pop":     "scale-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
        "gradient-x":    "gradient-x 4s ease infinite",
        orbit:           "orbit 3s linear infinite",
        blink:           "blink 1s step-end infinite",
        "fade-in":       "fade-in 0.3s ease both",
        "ping-slow":     "ping-slow 2s cubic-bezier(0,0,0.2,1) infinite",
        "confetti-drop": "confetti-drop 1s ease-in both",
      },
    },
  },
  plugins: [],
};
export default config;
