export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: { colors: { navy: { 950: '#050d1a', 900: '#0a1628', 800: '#0f2038', 700: '#16304f' }, sea: { DEFAULT: '#087FA5', 600: '#066b8c', 400: '#2aa5cc', 100: '#d9f0f7' } },
    keyframes: { float: { '0%,100%': { transform: 'translateY(0) rotate(-2deg)' }, '50%': { transform: 'translateY(-14px) rotate(1deg)' } }, shimmer: { '100%': { transform: 'translateX(100%)' } }, drift: { '0%,100%': { transform: 'translate3d(0,0,0)' }, '50%': { transform: 'translate3d(30px,-20px,0)' } } },
    animation: { float: 'float 7s ease-in-out infinite', drift: 'drift 14s ease-in-out infinite' },
    fontFamily: { sans: ['Inter', 'Noto Sans Khmer', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'ui-monospace', 'monospace'] } } },
  plugins: [],
}
