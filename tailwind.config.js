/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./templates/app.html",
    "./public/assets/app.js"
  ],
  theme: {
    extend: {
      colors: {
        brand: "#145aff"
      },
      boxShadow: {
        soft: "0 30px 90px rgba(20, 90, 255, 0.15)"
      }
    }
  },
  plugins: []
};
