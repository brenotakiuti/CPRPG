import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

// Enumerate every public WebP recursively, including future/unreferenced artwork.
function artworkFiles(dir: string, prefix = ''): { url: string; sha: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) return artworkFiles(absolute, relative);
    if (!entry.isFile() || !/\.webp$/i.test(entry.name)) return [];
    return [{ url: '/' + relative.split('/').map(encodeURIComponent).join('/'),
      sha: createHash('sha256').update(readFileSync(absolute)).digest('hex') }];
  });
}
const gmArtwork = artworkFiles(join(process.cwd(), 'public'));

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
    __GM_ARTWORK_MANIFEST__: JSON.stringify(gmArtwork),
  },
})
