import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Discover sponsor banners at build time, without hardcoding filenames.
const adsDir = join(process.cwd(), 'public', 'ads')
const banners = existsSync(adsDir)
  ? readdirSync(adsDir)
      .filter(name => /\.(webp|png|jpe?g)$/i.test(name))
      .sort()
      .map(name => '/ads/' + encodeURIComponent(name))
  : []

export default defineConfig({
  plugins: [react()],
  define: {
    __AD_BANNERS__: JSON.stringify(banners),
  },
})
