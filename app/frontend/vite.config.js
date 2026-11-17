import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://api:3000',
        changeOrigin: true
      },
      '/storage': {
        target: 'http://minio:9000/campushub',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/storage/, '')
      }
    }
  }
});
