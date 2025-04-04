/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{html,js,ts,jsx,tsx,vue}",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ["Inter"],
      },
    },
    screens: {
      mobile: "375px",
      // => @media (min-width: 375) { ... }

      tablet: "640px",
      // => @media (min-width: 640px) { ... }

      laptop: "1024px",
      // => @media (min-width: 1024px) { ... }

      desktop: "1280px",
      // => @media (min-width: 1280px) { ... }

      desktopxl: "1536px",

      desktop2xl: "1920px",

      desktop3xl: "2560px",
    },
    backgroundImage: {
      bgsearch: 'url("./assets/sfondo.png")',
    },
    content: {
      search: "url('./assets/state-layer.png')",
      logo: "url('./assets/logo_datahub.png')",
    },
  },
  plugins: [],
}

