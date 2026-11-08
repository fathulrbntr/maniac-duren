export async function readQRPhoto(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw Error('Gunakan foto JPG, PNG atau WebP maksimal 8 MB.');
  const [{default: jsQR}, bitmap] = await Promise.all([import('./vendor/jsqr.mjs'), createImageBitmap(file)]);
  try {
    if (bitmap.width * bitmap.height > 32000000) throw Error('Foto terlalu besar. Potong foto ke area QR terlebih dahulu.');
    const ratio = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const decoded = jsQR(pixels.data, pixels.width, pixels.height);
    if (!decoded?.data) throw Error('QR belum terbaca. Foto lebih dekat, lurus dan tanpa pantulan.');
    return decoded.data;
  } finally { bitmap.close(); }
}
