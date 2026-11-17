// Copia os arquivos do OCR (Tesseract) para public/ocr, para o app não depender de CDN.
import { copyFileSync, mkdirSync } from 'node:fs'
const out = 'public/ocr'
mkdirSync(out, { recursive: true })
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'por.traineddata.gz'],
]
for (const [from, to] of files) copyFileSync(from, `${out}/${to}`)
console.log('OCR copiado para', out)
