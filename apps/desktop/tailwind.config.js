/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mb: {
          bg: '#0E0E10',
          surface: '#19191C',
          ink: '#F5F5F3',
          muted: '#A5A5AB',
          line: '#2C2C31',
          accent: '#FFD21F',
          'accent-ink': '#0B0B0D',
          btn: '#FFFFFF',
          'btn-text': '#0B0B0D',
        },
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        dark: {
          900: '#0E0E10',
          800: '#19191C',
          700: '#2C2C31',
          600: '#3A3A40',
        },
        gold: {
          400: '#FFD21F',
          500: '#FFD21F',
          600: '#E6BC19',
        }
      },
      fontFamily: {
        heading: ['"Bricolage Grotesque"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flash': 'flash 0.3s ease-out',
      },
      keyframes: {
        flash: {
          '0%': { opacity: '1', backgroundColor: '#FFFFFF' },
          '100%': { opacity: '0', backgroundColor: 'transparent' },
        }
      }
    },
  },
  plugins: [],
}
