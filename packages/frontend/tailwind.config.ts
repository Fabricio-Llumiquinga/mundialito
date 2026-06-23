import type { Config } from 'tailwindcss';

/**
 * Tailwind CSS v4 uses CSS-first configuration via @theme directives in global.css.
 * This config file serves as a reference for the project's design tokens.
 * The actual theme is applied via src/styles/global.css and @heroui/react/styles.
 *
 * HeroUI v3 dark theme colors are overridden via CSS custom properties in global.css.
 */
const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Oswald', 'sans-serif'],
        sans: ['Source Sans 3', 'sans-serif'],
      },
      colors: {
        primary: { DEFAULT: '#E97250', foreground: '#ffffff' },
        secondary: { DEFAULT: '#F59438', foreground: '#000000' },
        danger: { DEFAULT: '#DE5760', foreground: '#ffffff' },
        success: { DEFAULT: '#27ae60', foreground: '#ffffff' },
        warning: { DEFAULT: '#F59438', foreground: '#000000' },
      },
    },
  },
  darkMode: 'class',
};
export default config;
