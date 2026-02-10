/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        erp: {
          bg: '#F3F4F6', // Light gray background
          pink: '#E91E63', // Pink accent from sidebar
          'pink-light': '#FCE4EC',
          blue: {
            50: '#E3F2FD', // Tab bar background
            100: '#BBDEFB',
            600: '#1E88E5', // Main blue text
            800: '#1565C0', // Darker blue
            900: '#0D47A1', // Title blue
          }
        },
        sand: {
          50: '#FAF9F7',
          100: '#F5F4F1',
          200: '#E8E6E1',
          300: '#D6D2CB',
        },
        charcoal: {
          900: '#1A1A1A',
          800: '#2A2A2A',
          700: '#3A3A3A',
          600: '#4A4A4A',
          500: '#6A6A6A',
          400: '#8A8A8A',
        },
        dark: {
          950: '#0A0A0A',
          900: '#121212',
          800: '#1E1E1E',
          700: '#2A2A2A',
          600: '#3A3A3A',
          500: '#4A4A4A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'header': ['32px', '1.2'],
        'section': ['26px', '1.3'],
        'large': ['20px', '1.4'],
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(0, 0, 0, 0.03)',
        'card': '0 2px 4px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.03)',
        'hover': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
      }
    },
  },
  plugins: [],
};
