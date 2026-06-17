/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-tertiary": "#ffffff",
        "on-error": "#ffffff",
        secondary: "#5f5e5e",
        "on-secondary-fixed-variant": "#474746",
        outline: "#916f6c",
        background: "#fff8f7",
        "error-container": "#ffdad6",
        "surface-container": "#ffe9e7",
        "secondary-container": "#e2dfde",
        "on-secondary-fixed": "#1b1c1c",
        primary: "#ae001a",
        tertiary: "#57554f",
        "tertiary-fixed": "#e7e2da",
        "on-error-container": "#93000a",
        "on-primary": "#ffffff",
        "tertiary-fixed-dim": "#cac6be",
        "surface-container-low": "#fff0ef",
        "surface-container-highest": "#fbdbd9",
        "on-tertiary-container": "#f5f0e8",
        "primary-fixed": "#ffdad7",
        "surface-variant": "#fbdbd9",
        "outline-variant": "#e5bdba",
        "secondary-fixed-dim": "#c8c6c5",
        error: "#ba1a1a",
        "inverse-primary": "#ffb3ae",
        "on-surface-variant": "#5c403d",
        "secondary-fixed": "#e5e2e1",
        "inverse-surface": "#3f2c2a",
        surface: "#fff8f7",
        "on-background": "#281716",
        "on-tertiary-fixed": "#1d1c17",
        "on-secondary-container": "#636262",
        "surface-dim": "#f2d3d0",
        "inverse-on-surface": "#ffedeb",
        "on-primary-fixed-variant": "#930015",
        "primary-fixed-dim": "#ffb3ae",
        "surface-container-high": "#ffe1df",
        "on-primary-fixed": "#410004",
        "surface-bright": "#fff8f7",
        "on-surface": "#281716",
        "primary-container": "#d51f2c",
        "surface-tint": "#bf041f",
        "on-secondary": "#ffffff",
        "surface-container-lowest": "#ffffff",
        "on-tertiary-fixed-variant": "#494741",
        "on-primary-container": "#ffecea",
        "tertiary-container": "#706d67"
      },
      borderRadius: {
        DEFAULT: "1rem",
        lg: "2rem",
        xl: "3rem",
        full: "9999px"
      },
      spacing: {
        unit: "4px",
        gutter: "16px",
        xs: "4px",
        sidebar_collapsed: "64px",
        lg: "24px",
        md: "16px",
        sidebar_width: "260px",
        xl: "32px",
        sm: "8px"
      },
      fontFamily: {
        sans: ["Poppins", "sans-serif"],
        "data-mono": ["monospace"]
      },
      fontSize: {
        "body-sm": ["13px", {lineHeight: "1.4", fontWeight: "400"}],
        h1: ["32px", {lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600"}],
        "data-mono": ["13px", {lineHeight: "1.0", fontWeight: "500"}],
        h3: ["20px", {lineHeight: "1.4", fontWeight: "500"}],
        "body-lg": ["16px", {lineHeight: "1.5", fontWeight: "400"}],
        "body-md": ["14px", {lineHeight: "1.5", fontWeight: "400"}],
        h2: ["24px", {lineHeight: "1.3", fontWeight: "600"}],
        "label-caps": ["11px", {lineHeight: "1.0", letterSpacing: "0.08em", fontWeight: "700"}]
      }
    }
  },
  plugins: [],
}
