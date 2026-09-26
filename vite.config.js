import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // For GitHub project pages, change this to '/YOUR-REPO-NAME/'.
  // For a custom domain or USERNAME.github.io root site, keep '/'.
  base: '/'
});
