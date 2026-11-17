import type { Config } from "tailwindcss";
export default {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#10151f", brand: { 50: "#eff6ff", 600: "#2563eb", 700: "#1d4ed8" } } } },
  plugins: []
} satisfies Config;
