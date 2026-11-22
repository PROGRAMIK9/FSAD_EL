const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        fg: token('fg'),
        muted: token('muted'),
        subtle: token('subtle'),
        primary: { DEFAULT: token('primary'), strong: token('primary-strong'), solid: token('primary-solid'), fg: token('primary-fg'), soft: token('primary-soft') },
        ink: { DEFAULT: token('ink'), fg: token('ink-fg') },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
        sidebar: { DEFAULT: token('sidebar'), fg: token('sidebar-fg'), active: token('sidebar-active') },
        tile: {
          green: token('tile-green'),
          lavender: token('tile-lavender'),
          lime: token('tile-lime'),
          pink: token('tile-pink'),
          yellow: token('tile-yellow'),
          ink: token('tile-ink'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        accent: ['"Instrument Serif"', 'Georgia', 'ui-serif', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(30 20 70 / 0.03)',
        lift: '0 2px 4px rgb(30 20 70 / 0.04), 0 16px 32px -16px rgb(30 20 70 / 0.22)',
        pop: '0 24px 56px -18px rgb(30 20 70 / 0.32), 0 6px 14px -6px rgb(30 20 70 / 0.1)',
        hero: '0 24px 48px -26px rgb(91 59 214 / 0.6)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'scale-in': { from: { opacity: 0, transform: 'scale(.97) translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.025)' }, '100%': { transform: 'scale(1)' } },
        'rise-in': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
        shake: { '0%,100%': { transform: 'none' }, '25%': { transform: 'translateX(-6px)' }, '75%': { transform: 'translateX(6px)' } },
      },
      animation: {
        'fade-in': 'fade-in .15s ease-out',
        'scale-in': 'scale-in .18s ease-out',
        'slide-in': 'slide-in .22s ease-out',
        shake: 'shake .3s ease-in-out 2',
        pop: 'pop .28s ease-out',
        'rise-in': 'rise-in .35s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
};
