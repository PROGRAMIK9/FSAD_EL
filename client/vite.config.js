import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const require = createRequire(import.meta.url);
const pkgDir = (name) => normalizePath(dirname(require.resolve(`${name}/package.json`)));
const flat = (src, dest) => ({ src, dest, rename: { stripBase: true } });

// The question-paper OCR engine is served from this origin (/ocr/) so the CSP can stay same-origin.
const ocrAssets = viteStaticCopy({
  targets: [
    flat(`${pkgDir('tesseract.js')}/dist/worker.min.js`, 'ocr'),
    flat(`${pkgDir('tesseract.js-core')}/tesseract-core*-lstm.wasm.js`, 'ocr'),
    flat(`${pkgDir('@tesseract.js-data/eng')}/4.0.0_best_int/eng.traineddata.gz`, 'ocr'),
    flat(`${pkgDir('pdfjs-dist')}/cmaps/*`, 'ocr/pdf/cmaps'),
    flat(`${pkgDir('pdfjs-dist')}/standard_fonts/*`, 'ocr/pdf/standard_fonts'),
    flat(`${pkgDir('pdfjs-dist')}/wasm/*.wasm`, 'ocr/pdf/wasm'),
  ],
});

export default defineConfig({ plugins: [react(), ocrAssets], envDir: '..', server: { port: 5173, strictPort: true }, build: { rollupOptions: { output: { manualChunks: { 'vendor-react': ['react', 'react-dom', 'react-router-dom'], 'vendor-charts': ['recharts'], 'vendor-icons': ['lucide-react'] } } } }, test: { environment: 'jsdom' } });
