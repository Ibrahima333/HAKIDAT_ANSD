import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const apiBaseUrl = env.VITE_API_BASE_URL;
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      // Cible le service `backend` du réseau Docker Compose — ce frontend
      // tourne en conteneur dev à côté du backend, pas sur l'hôte.
      proxy: apiBaseUrl
        ? undefined
        : {
            '/api': {
              target: 'http://backend:8000',
              changeOrigin: true,
            },
          },
    },
  };
});
