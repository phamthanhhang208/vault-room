/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary':      '#0a0a0f',
        'bg-card':         '#12121a',
        'bg-card-hover':   '#1a1a28',
        'border-dim':      '#1e1e2e',
        'text-primary':    '#e4e4ef',
        'text-secondary':  '#8888a0',
        'accent-purple':   '#6c5ce7',
        'accent-dim':      '#4a3db8',
        'status-safe':     '#00d26a',
        'status-warn':     '#ff9f43',
        'status-danger':   '#ff4757',
        'status-info':     '#00b4d8',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
