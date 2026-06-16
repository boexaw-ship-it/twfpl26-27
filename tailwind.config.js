/** @type {import('tailwindcss').Config} */

module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // === TW FPL Brand Colors (Logo မှ ယူထားသော) ===
        green: {
          950: "#0D2B1A", // Darkest background
          900: "#1B4D2E", // Primary background
          800: "#1F5C36", // Card background
          700: "#2A7A47", // Hover states
          600: "#3A9E5F", // Active states
        },
        gold: {
          DEFAULT: "#C9A84C", // Primary gold
          light: "#E8D5A3",   // Muted gold / text
          dark: "#A07830",    // Dark gold
          shine: "#F0D060",   // Bright gold highlight
        },
        // === UI Colors ===
        surface: {
          DEFAULT: "#1F5C36", // Card surface
          dark: "#162F20",    // Darker surface
          light: "#2A7A47",   // Lighter surface
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Bebas Neue", "sans-serif"], // Score/Points display
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        gold: "0 0 15px rgba(201, 168, 76, 0.3)",
        card: "0 4px 20px rgba(0, 0, 0, 0.4)",
        glow: "0 0 30px rgba(201, 168, 76, 0.15)",
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg, #C9A84C, #F0D060, #A07830)",
        "green-gradient": "linear-gradient(180deg, #1B4D2E, #0D2B1A)",
        "card-gradient": "linear-gradient(145deg, #1F5C36, #162F20)",
      },
      screens: {
        xs: "375px", // Small phones
        sm: "640px",
        md: "768px",
        lg: "1024px",
      },
    },
  },
  plugins: [],
};

