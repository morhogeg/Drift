/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-surface) / <alpha-value>)',
          elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
          bubble: 'rgb(var(--color-elevated) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
        },
        accent: {
          // Drift brand — pink → violet, now with a luminous ramp so surfaces
          // can glow from within rather than sit flat. 500 == the original brand.
          pink: '#ff007a',
          violet: '#a855f7',
          'pink-300': '#ff6bb0',
          'pink-400': '#ff3d96',
          'pink-500': '#ff007a',
          'pink-600': '#d60067',
          'violet-300': '#c89bf9',
          'violet-400': '#b87cf6',
          'violet-500': '#a855f7',
          'violet-600': '#8b3fd4',
          // Discovery accent — used by the intelligence layer / connections.
          discovery: '#22d3ee',
          'discovery-300': '#67e8f9',
          'discovery-500': '#22d3ee',
          'discovery-600': '#0891b2',
        },
        text: {
          primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'Satoshi', 'system-ui', 'sans-serif'],
      },
      // ── Type scale ── replaces ad-hoc text-[Npx] across the app.
      fontSize: {
        micro: ['9.5px', { lineHeight: '1.3', letterSpacing: '0.02em' }],
        tiny: ['11px', { lineHeight: '1.4' }],
        meta: ['13px', { lineHeight: '1.5' }],
        body: ['15px', { lineHeight: '1.6' }],
        title: ['17px', { lineHeight: '1.35', letterSpacing: '-0.01em' }],
      },
      // ── Motion easing tokens ── the tree's proven spring, promoted to shared use.
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.46, 0.64, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-soft': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      // ── Luminous elevation ── color-tinted glows; surfaces feel lit, not stacked.
      boxShadow: {
        'glow-sm': '0 0 16px -2px rgba(168, 85, 247, 0.25)',
        'glow-md': '0 0 32px -4px rgba(168, 85, 247, 0.30)',
        'glow-lg': '0 8px 60px -8px rgba(168, 85, 247, 0.35)',
        'glow-pink': '0 0 32px -4px rgba(255, 0, 122, 0.30)',
        'glow-discovery': '0 0 28px -4px rgba(34, 211, 238, 0.35)',
      },
      animation: {
        'fade-up': 'fadeUp 0.3s ease-out',
        'glow': 'glow 2s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'float': 'float 20s ease-in-out infinite',
        'float-slow': 'float 30s ease-in-out infinite',
        'gradient': 'gradient 8s ease infinite',
        'fade-in': 'fadeIn 0.6s ease-out',
        'blob': 'blob 10s infinite',
        'shimmer': 'shimmer 2s linear infinite',
        // ── Apple-level motion additions ──
        'breathe': 'breathe 4s ease-in-out infinite',
        'reveal-up': 'revealUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'text-shimmer': 'textShimmer 2.4s linear infinite',
        'bloom': 'bloom 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 0 2px rgba(255, 0, 122, 0.3)' },
          '50%': { boxShadow: '0 0 0 2px rgba(255, 0, 122, 0.5)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-30px)' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        fadeIn: {
          'from': { opacity: '0', transform: 'translateY(20px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        blob: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        shimmer: {
          'from': { transform: 'translateX(-100%)' },
          'to': { transform: 'translateX(100%)' },
        },
        // Idle "breathing" — subtle, alive, never dead. Used on quiet surfaces.
        breathe: {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.015)' },
        },
        // Per-message / per-node entrance — content arrives, doesn't just appear.
        revealUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Streaming text — a soft light sweeps across as thought materializes.
        textShimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        // Drift opening — a space unfolding: scale + glow blooming outward.
        bloom: {
          '0%': { opacity: '0', transform: 'scale(0.96)', filter: 'blur(6px)' },
          '60%': { opacity: '1', filter: 'blur(0)' },
          '100%': { opacity: '1', transform: 'scale(1)', filter: 'blur(0)' },
        },
      },
      backgroundImage: {
        'grain': "url('data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.02'/%3E%3C/svg%3E')",
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}