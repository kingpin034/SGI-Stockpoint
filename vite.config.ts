import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 4176, strictPort: true },
  preview: { port: 4176, strictPort: true },
  build: { target: 'es2022', rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'react', test: /node_modules\/(react|react-dom|scheduler)\// }] } } } },
});
