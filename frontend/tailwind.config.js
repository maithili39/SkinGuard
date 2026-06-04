/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        dark: '#0f172a',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-right': {
          '0%':   { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-ring': {
          '0%':   { transform: 'scale(1)', opacity: '0.8' },
          '70%':  { transform: 'scale(1.15)', opacity: '0' },
          '100%': { transform: 'scale(1.15)', opacity: '0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
        'stagger-in': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'score-fill': {
          '0%':   { strokeDashoffset: '283' },
          '100%': { strokeDashoffset: 'var(--dash-offset)' },
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'scan-line': {
          '0%':   { transform: 'translateY(-60px)', opacity: '0' },
          '10%':  { opacity: '1' },
          '90%':  { opacity: '1' },
          '100%': { transform: 'translateY(60px)', opacity: '0' },
        },
      },
      animation: {
        'fade-in-up':     'fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in':        'fade-in 0.3s ease both',
        'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in':       'scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
        'shimmer':        'shimmer 2s linear infinite',
        'pulse-ring':     'pulse-ring 1.5s ease-out infinite',
        'float':          'float 3s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 6s ease infinite',
        'score-fill':     'score-fill 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'spin-slow':      'spin-slow 8s linear infinite',
        'scan-line':      'scan-line 1.8s ease-in-out infinite',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow-green':  '0 0 30px rgba(34, 197, 94, 0.35)',
        'glow-amber':  '0 0 30px rgba(245, 158, 11, 0.35)',
        'glow-rose':   '0 0 30px rgba(244, 63, 94, 0.35)',
        'glow-violet': '0 0 30px rgba(139, 92, 246, 0.35)',
        'inner-glow':  'inset 0 1px 0 rgba(255,255,255,0.15)',
        'card':        '0 2px 16px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
        'card-hover':  '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        'glass':       '0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      transitionDuration: {
        '400': '400ms',
      },
    },
  },
  plugins: [],
};
