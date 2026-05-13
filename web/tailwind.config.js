/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        risk: {
          low: '#10b981',
          moderate: '#f59e0b',
          high: '#f97316',
          severe: '#dc2626'
        },
        brand: {
          DEFAULT: '#0c4a6e',
          light: '#0ea5e9'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 600ms ease-out'
      }
    }
  },
  plugins: []
}
