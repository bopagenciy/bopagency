import type { Config } from 'tailwindcss';

/**
 * Phase 8A.0 — Branding & Theming Foundation.
 *
 * Los colores de marca NO se hardcodean aquí como hex — se leen de las
 * variables CSS definidas en `src/styles/globals.css` (única fuente de
 * verdad de la paleta corporativa). Esto permite:
 *   - cambiar la paleta sin tocar componentes;
 *   - soportar opacidad (`bg-primary/50`) vía el patrón
 *     `rgb(var(--token) / <alpha-value>)`;
 *   - mantener los colores semánticos (success/warning/destructive/info)
 *     conceptualmente separados de los colores de marca (primary/accent/
 *     sidebar-*), aunque ambos vivan en el mismo archivo de tokens.
 *
 * Ver docs/implementation/phase-8/PHASE_8A0_BRANDING_THEME_REPORT.md para
 * el detalle de la paleta, los ajustes de contraste y su justificación.
 */
function withOpacity(variable: string) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: withOpacity('--background'),
        foreground: withOpacity('--foreground'),

        card: {
          DEFAULT: withOpacity('--card'),
          foreground: withOpacity('--card-foreground'),
        },

        muted: {
          DEFAULT: withOpacity('--muted'),
          foreground: withOpacity('--muted-foreground'),
        },

        border: withOpacity('--border'),
        input: withOpacity('--input'),
        ring: withOpacity('--ring'),

        primary: {
          DEFAULT: withOpacity('--primary'),
          hover: withOpacity('--primary-hover'),
          accent: withOpacity('--primary-accent'),
          foreground: withOpacity('--primary-foreground'),
        },

        secondary: {
          DEFAULT: withOpacity('--secondary'),
          foreground: withOpacity('--secondary-foreground'),
        },

        accent: {
          DEFAULT: withOpacity('--accent'),
          foreground: withOpacity('--accent-foreground'),
        },

        'warm-yellow': withOpacity('--warm-yellow'),

        success: {
          DEFAULT: withOpacity('--success'),
          foreground: withOpacity('--success-foreground'),
        },
        warning: {
          DEFAULT: withOpacity('--warning'),
          foreground: withOpacity('--warning-foreground'),
        },
        destructive: {
          DEFAULT: withOpacity('--destructive'),
          foreground: withOpacity('--destructive-foreground'),
        },
        info: {
          DEFAULT: withOpacity('--info'),
          foreground: withOpacity('--info-foreground'),
        },

        sidebar: {
          DEFAULT: withOpacity('--sidebar-background'),
          foreground: withOpacity('--sidebar-foreground'),
          muted: withOpacity('--sidebar-muted'),
          hover: withOpacity('--sidebar-hover'),
          active: withOpacity('--sidebar-active'),
          'active-foreground': withOpacity('--sidebar-active-foreground'),
          border: withOpacity('--sidebar-border'),
          accent: withOpacity('--sidebar-accent'),
        },

        'brand-red': withOpacity('--brand-red'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
