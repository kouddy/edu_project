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
        light: {
          colors: {
            primary: {
              50: "#f0fdfa",
              100: "#ccfbf1",
              200: "#99f6e0",
              300: "#5eead4",
              400: "#2dd4bf",
              500: "#14b8a6",
              600: "#0d9488",
              700: "#0f766e",
              800: "#115e59",
              900: "#134e4a",
              DEFAULT: "#0d9488",
              foreground: "#ffffff",
            },
            focus: "#0d9488",
          },
        },
        dark: {
          colors: {
            primary: {
              50: "#f0fdfa",
              100: "#ccfbf1",
              200: "#99f6e0",
              300: "#5eead4",
              400: "#2dd4bf",
              500: "#14b8a6",
              600: "#0d9488",
              700: "#0f766e",
              800: "#115e59",
              900: "#134e4a",
              DEFAULT: "#2dd4bf",
              foreground: "#062a27",
            },
            focus: "#2dd4bf",
          },
        },
      },
    }),
  ],
};
