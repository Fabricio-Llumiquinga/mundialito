import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      '@mudialito/shared': path.resolve(__dirname, '../shared/src'),
      // Force single React instance to prevent "Invalid hook call" errors
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      // Resolve @heroui/styles and tw-animate-css from monorepo root for CSS imports
      '@heroui/styles': path.resolve(__dirname, '../../node_modules/@heroui/styles/dist'),
      'tw-animate-css': path.resolve(__dirname, '../../node_modules/tw-animate-css/dist/tw-animate.css'),
    },
    dedupe: ['react', 'react-dom'],
  },
});
