import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const API_PORT = Number(process.env.API_PORT ?? 8787);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ['..'] },
    proxy: { '/api': { target: `http://localhost:${API_PORT}`, changeOrigin: true } },
  },
});
