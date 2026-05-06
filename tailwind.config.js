/** @type {import('tailwindcss').Config} */
// Flowra design system — Tailwind config.
// Aliases violet-* as primary-* so future rebranding is one-line.
// Additive: existing violet-*, indigo-*, gray-* classes still work.

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary alias — pointed at violet.
        primary: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',   // FlowraLogo, active sidebar, primary CTA
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // Semantic foreground ramp
        fg: {
          1: '#111827',
          2: '#374151',
          3: '#6b7280',
          4: '#9ca3af',
        },
        // Semantic surface
        surface: {
          DEFAULT: '#ffffff',
          subtle:  '#f9fafb',
          muted:   '#f3f4f6',
        },
      },
      borderRadius: {
        xl:    '12px',
        '2xl': '16px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(17,24,39,0.05), 0 1px 3px 0 rgba(17,24,39,0.06)',
        pdf:  '0 0 0 1px rgba(17,24,39,0.04), 0 8px 24px -8px rgba(17,24,39,0.12)',
      },
      fontSize: {
        xxs: ['10px', { lineHeight: '14px', letterSpacing: '0.1em' }],
      },
      spacing: {
        'page-x': '1.5rem',
        'page-y': '1.5rem',
      },
    },
  },
  plugins: [],
}
