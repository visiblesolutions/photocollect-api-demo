/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./templates/app.html",
    "./public/assets/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        brand: "#1557ff"
      },
      boxShadow: {
        soft: "0 30px 90px rgba(20, 90, 255, 0.15)"
      }
    }
  },
  plugins: []
};
