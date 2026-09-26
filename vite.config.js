import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: { proxy: { '/api': {
      target: `http://127.0.0.1:${process.env.PORT || env.PORT || 3001}`,
      // Preserve the browser's host so same-origin validation works through Vite.
      changeOrigin: false,
    } } },
    // For GitHub project pages, change this to '/YOUR-REPO-NAME/'.
    // For a custom domain or USERNAME.github.io root site, keep '/'.
    base: '/pairwise_human_study/'
  };
});
