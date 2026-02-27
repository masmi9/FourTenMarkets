/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        "brand-green": "#22c55e",
        "brand-red": "#ef4444",
        "brand-card": "#1a1d27",
        "brand-surface": "#0f1117",
      },
    },
  },
  plugins: [],
};
