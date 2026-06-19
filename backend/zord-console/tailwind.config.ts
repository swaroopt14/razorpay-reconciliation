import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './services/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Zord Blue - Primary Color System
        'zord-blue': {
          50: '#EFF6FF',   // Selection background (lightest allowed)
          500: '#3B82F6',  // Hover state, links
          600: '#2563EB',   // Primary blue (Zord Blue)
          700: '#1D4ED8',   // Pressed state
          800: '#1E3A8A',   // Selected table rows (subtle)
        },
        // Neutral Base (90% of admin UI)
        'zord-base': {
          main: '#0B1220',      // Background (main)
          panel: '#111827',     // Panel background
          table: '#0F172A',     // Table rows
          border: '#1F2937',    // Borders / dividers
          text: {
            primary: '#E5E7EB',   // Primary text
            secondary: '#9CA3AF', // Secondary text
          },
        },
        // Status Colors (Muted, Not Loud)
        'zord-status': {
          healthy: '#16A34A',   // Muted green
          degraded: '#CA8A04',  // Amber
          failed: '#DC2626',     // Red
          active: '#2563EB',     // Blue
          neutral: '#9CA3AF',    // Gray
        },
        // Destructive (Rare)
        'zord-destructive': {
          bg: '#7F1D1D',
          text: '#FECACA',
        },

        // Customer UI palette (used by /customer/* pages)
        // These are static hex values to ensure Tailwind generates the classes
        // (e.g. bg-cx-purple-600). Customer dark-mode tokens are handled via
        // CSS variables in app/customer/layout.tsx.
        'cx-text': '#1F2937',
        'cx-neutral': '#6B7280',
        'cx-danger': {
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
        'cx-energy': {
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
        },
        'cx-success': {
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
        },
        'cx-purple': {
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
          900: '#4C1D95',
        },
        'cx-teal': {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A',
        },
      },
      borderRadius: {
        'zord': '4px', // Consistent 4px radius
      },
    },
  },
  plugins: [],
}
export default config
