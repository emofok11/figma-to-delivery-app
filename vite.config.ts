import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 部署在子路径下，必须设置 base
  base: '/figma-to-delivery-app/',
  server: {
    port: 3000,
    open: true
  }
})