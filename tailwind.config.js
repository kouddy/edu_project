import { heroui } from "@heroui/react";

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    // HeroUI theme slot classes. npm may hoist @heroui/theme to the top level
    // or nest it under @heroui/react — list both layouts so the styles are
    // generated either way (a missing path simply matches nothing).
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/react/node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-nunito)", "ui-rounded", "system-ui", "sans-serif"],
      },
    },
  },
  darkMode: "class",
  plugins: [
    heroui({
      defaultTheme: "light",
      themes: {
        // Warm "paper & pencil" theme: paper background, ink text, and an
        // energetic orange primary. Semantic colors (success/danger/warning
        // verdict chips) stay at HeroUI defaults — they carry meaning.
        light: {
          colors: {
            background: "#FFFCF7",
            foreground: "#1C1917",
            content1: {
              DEFAULT: "#FFFFFF",
              foreground: "#1C1917",
            },
            primary: {
              50: "#fff7ed",
              100: "#ffedd5",
              200: "#fed7aa",
              300: "#fdba74",
              400: "#fb923c",
              500: "#f97316",
              600: "#ea580c",
              700: "#c2410c",
              800: "#9a3412",
              900: "#7c2d12",
              DEFAULT: "#ea580c",
              foreground: "#ffffff",
            },
            focus: "#ea580c",
          },
        },
        dark: {
          colors: {
            background: "#1C1917",
            foreground: "#FAFAF9",
            content1: {
              DEFAULT: "#292524",
              foreground: "#FAFAF9",
            },
            primary: {
              50: "#fff7ed",
              100: "#ffedd5",
              200: "#fed7aa",
              300: "#fdba74",
              400: "#fb923c",
              500: "#f97316",
              600: "#ea580c",
              700: "#c2410c",
              800: "#9a3412",
              900: "#7c2d12",
              DEFAULT: "#fb923c",
              foreground: "#431407",
            },
            focus: "#fb923c",
          },
        },
      },
    }),
  ],
};
