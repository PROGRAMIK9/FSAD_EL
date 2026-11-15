/**
 * Reads the text of a question paper in the browser.
 *
 * - PDFs with a text layer are read directly (fast, exact).
 * - Scanned PDF pages and images are read with Tesseract OCR.
 *
 * Every engine file (tesseract worker, WASM core, English model, pdf.js worker and fonts) is
 * served from this app's own origin under /ocr/ (see vite.config.js), so nothing is fetched from a
 * CDN and the production Content-Security-Policy stays same-origin.
 *
 * Import this module dynamically: it pulls in tesseract.js and pdf.js.
 */
import { createWorker } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { linesFromPdfItems } from './paper-parser.js';

export const MAX_FILE_BYTES = 15_000_000;
export const MAX_PDF_PAGES = 10;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif'];
// Pages with less text than this are treated as scans and OCR'd.
const MIN_TEXT_CHARS = 40;
const RENDER_SCALE = 2;

const ASSETS = `${import.meta.env.BASE_URL}ocr/`;
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
export const isSupported = (file) => isPdf(file) || IMAGE_TYPES.includes(file.type);

class Cancelled extends Error {
  constructor() {
    super('Reading was cancelled');
    this.name = 'AbortError';
  }
}

/**
 * @param {File} file an image or PDF
 * @param {{ onProgress?: (p: { page: number, pages: number, progress: number, status: string }) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ pages: string[], ocrPages: number }>} text per page and how many pages needed OCR
 */
export async function readQuestionPaper(file, { onProgress = () => {}, signal } = {}) {
  if (!isSupported(file)) throw new Error('Upload a PDF or a PNG, JPG or WebP image');
  if (file.size > MAX_FILE_BYTES) throw new Error('The file must be under 15 MB');

  let worker = null;
  let pages = 1;
  let page = 1;
  const report = (status, pageProgress = 0) =>
    onProgress({ page, pages, status, progress: Math.min(1, (page - 1 + pageProgress) / pages) });

  const abort = () => worker?.terminate();
  signal?.addEventListener('abort', abort, { once: true });
  const check = () => {
    if (signal?.aborted) throw new Cancelled();
  };
  // A terminated worker never settles its pending job, so race every job against the signal.
  const guarded = (promise) =>
    signal
      ? Promise.race([
          promise,
          new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(new Cancelled()), { once: true }),
          ),
        ])
      : promise;

  const ocr = async (image) => {
    if (!worker) {
      report('Loading the OCR engine');
      worker = await guarded(
        createWorker('eng', 1, {
          workerPath: `${ASSETS}worker.min.js`,
          corePath: ASSETS,
          langPath: ASSETS,
          workerBlobURL: false,
          logger: (m) => {
            if (m.status === 'recognizing text') report('Reading text', m.progress);
          },
        }),
      );
      check();
    }
    report('Reading text');
    const { data } = await guarded(worker.recognize(image));
    return data.text;
  };

  try {
    if (!isPdf(file)) return { pages: [await ocr(file)], ocrPages: 1 };

    report('Opening the PDF');
    const loading = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: `${ASSETS}pdf/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${ASSETS}pdf/standard_fonts/`,
      wasmUrl: `${ASSETS}pdf/wasm/`,
      isEvalSupported: false,
    });
    try {
      const pdf = await guarded(loading.promise);
      if (pdf.numPages > MAX_PDF_PAGES)
        throw new Error(`The PDF has ${pdf.numPages} pages; upload at most ${MAX_PDF_PAGES} at a time`);
      pages = pdf.numPages;
      const texts = [];
      let ocrPages = 0;
      for (page = 1; page <= pages; page++) {
        check();
        report('Reading the text layer');
        const pdfPage = await pdf.getPage(page);
        const text = linesFromPdfItems((await pdfPage.getTextContent()).items);
        if (text.replace(/\s/g, '').length >= MIN_TEXT_CHARS) {
          texts.push(text);
          continue;
        }
        report('Rendering a scanned page');
        const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        try {
          await guarded(pdfPage.render({ canvas, viewport }).promise);
          texts.push(await ocr(canvas));
          ocrPages++;
        } finally {
          canvas.width = canvas.height = 0;
          pdfPage.cleanup();
        }
      }
      page = pages;
      report('Done', 1);
      return { pages: texts, ocrPages };
    } finally {
      // pdf.js 6 only exposes destroy() on the loading task; it also releases the document.
      loading.destroy();
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    await worker?.terminate().catch(() => {});
  }
}
