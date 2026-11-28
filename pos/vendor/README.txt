Vendored for local QR validation/rendering, without CDN or upload.
jsQR 1.4.0: https://github.com/cozmo/jsQR (Apache-2.0, LICENSE-jsQR.txt).
qrcode-generator 2.0.4: https://github.com/kazuhikoarase/qrcode-generator (MIT, license header in qrcode.mjs).
jsQR modification: UMD wrapper replaced with ES module export; decoding algorithm unchanged.

barcode-reader.mjs is the local one-dimensional barcode decoder from @zxing/library
0.21.3 (LICENSE-zxing.txt). The bundle includes ts-custom-error (LICENSE-ts-custom-error.txt).
Rebuild from the repository root after npm ci with the following command.
npx --yes esbuild@0.27.0 --bundle --format=esm --minify --legal-comments=inline --loader=js --outfile=pos/vendor/barcode-reader.mjs <<'ENTRY'
export { default as BinaryBitmap } from "@zxing/library/es2015/core/BinaryBitmap.js";
export { default as HybridBinarizer } from "@zxing/library/es2015/core/common/HybridBinarizer.js";
export { HTMLCanvasElementLuminanceSource } from "@zxing/library/es2015/browser/HTMLCanvasElementLuminanceSource.js";
export { default as Code128Reader } from "@zxing/library/es2015/core/oned/Code128Reader.js";
export { default as Code39Reader } from "@zxing/library/es2015/core/oned/Code39Reader.js";
export { default as EAN13Reader } from "@zxing/library/es2015/core/oned/EAN13Reader.js";
export { default as EAN8Reader } from "@zxing/library/es2015/core/oned/EAN8Reader.js";
export { default as ITFReader } from "@zxing/library/es2015/core/oned/ITFReader.js";
ENTRY
