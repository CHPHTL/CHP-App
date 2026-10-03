/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        slateblue: '#1e293b',
        ready: '#15803d',
        pending: '#b45309',
        urgent: '#b91c1c',
        blocked: '#6b7280'
      }
    }
  },
  plugins: []
}
