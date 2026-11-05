/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'mb-bg': 'var(--bg)',
        'mb-surface': 'var(--surface)',
        'mb-ink': 'var(--ink)',
        'mb-muted': 'var(--muted)',
        'mb-line': 'var(--line)',
        'mb-btn': 'var(--btn)',
        'mb-btn-ink': 'var(--btn-ink)',
        'mb-btn-text': 'var(--btn-ink)',
        'mb-accent': '#FFD21F',
        'mb-accent-ink': '#0B0B0D',
        'mb-deep': 'var(--deep)',
        'mb-deep-ink': 'var(--deep-ink)',
        'mb-err': 'var(--err)',
        brand: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#facc15',
          500: '#FFD21F',
          600: '#ca8a04',
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
        },
      },
      fontFamily: {
        heading: ["'Bricolage Grotesque'", '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        sans: ["'Figtree'", 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        heading: '-0.02em',
      },
      lineHeight: {
        heading: '1.08',
        body: '1.6',
      },
    },
  },
  plugins: [],
};
