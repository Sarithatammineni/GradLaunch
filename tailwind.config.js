/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#bce1ff",
          300: "#8ed0ff",
          400: "#59b6ff",
          500: "#3395fb",
          600: "#1d76ef",
          700: "#155fdd",
          800: "#184eb3",
          900: "#1a438d",
          950: "#142c5e"
        }
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1)"
      }
    }
  },
  plugins: []
};
