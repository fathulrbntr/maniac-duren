// Shared by normal uploads and the owner-only maintenance page. No dependency.
export const PHOTO_LIMITS = Object.freeze({
  product: { edge: 960, minEdge: 640, bytes: 160 * 1024, quality: [.86, .8, .74] },
  profile: { edge: 480, minEdge: 320, bytes: 70 * 1024, quality: [.86, .8, .74] },
  ktp: { edge: 1600, minEdge: 1200, bytes: 450 * 1024, quality: [.92, .88, .84] },
  evidence: { edge: 1280, minEdge: 960, bytes: 250 * 1024, quality: [.9, .84, .78] },
});
const types = ['image/jpeg', 'image/png', 'image/webp'];
export function photoBlob(data) {
  const match = String(data).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4) throw Error('Foto harus JPG, PNG, atau WebP');
  const raw = atob(match[2]);
  return new Blob([Uint8Array.from(raw, c => c.charCodeAt(0))], { type: match[1] });
}
async function dataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('Gagal membaca hasil kompresi foto'));
    reader.readAsDataURL(blob);
  });
}
async function decode(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* Image is also supported by browsers without bitmap decoding. */ }
  }
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(Error('Foto rusak atau formatnya tidak didukung'));
      image.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
export async function compressPhoto(input, kind = 'product') {
  const limits = PHOTO_LIMITS[kind];
  if (!limits) throw Error('Jenis foto tidak dikenal');
  const source = typeof input === 'string' ? photoBlob(input) : input;
  if (!source || !types.includes(source.type)) throw Error('Pilih foto JPG, PNG, atau WebP');
  if (!source.size || source.size > 20 * 1024 * 1024) throw Error('File sumber maksimal 20 MB sebelum kompresi');
  const decoded = await decode(source);
  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > 50_000_000)
      throw Error('Resolusi foto terlalu besar atau tidak valid (maksimal 50 megapiksel)');
    const sourceEdge = Math.max(decoded.width, decoded.height);
    // Do not repeatedly recompress already-small photos, including repeat maintenance runs.
    if (source.size <= limits.bytes && sourceEdge <= limits.edge) {
      return { photo: typeof input === 'string' ? input : await dataURL(source), bytes: source.size, changed: false, width: decoded.width, height: decoded.height };
    }
    const canvas = document.createElement('canvas');
    let edge = Math.min(sourceEdge, limits.edge);
    const minEdge = Math.min(sourceEdge, limits.minEdge);
    while (true) {
      canvas.width = Math.max(1, Math.round(decoded.width * edge / sourceEdge));
      canvas.height = Math.max(1, Math.round(decoded.height * edge / sourceEdge));
      const context = canvas.getContext('2d');
      if (!context) throw Error('Browser tidak mendukung kompresi foto');
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      let fallbackType = null;
      for (const quality of limits.quality) {
        let blob = await new Promise(resolve => canvas.toBlob(resolve, fallbackType || 'image/webp', quality));
        if (!blob) throw Error('Kompresi foto gagal');
        if (!fallbackType && blob.type !== 'image/webp') {
          // Unsupported WebP encoding returns PNG. Preserve transparent pixels.
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let transparent = false;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) { transparent = true; break; }
          fallbackType = transparent ? 'image/png' : 'image/jpeg';
          blob = await new Promise(resolve => canvas.toBlob(resolve, fallbackType, quality));
          if (!blob) throw Error('Kompresi foto gagal');
        }
        if (blob.size <= limits.bytes) {
          const chosen = source.size < blob.size ? source : blob;
          const changed = chosen !== source;
          return { photo: !changed && typeof input === 'string' ? input : await dataURL(chosen), bytes: chosen.size, changed, width: changed ? canvas.width : decoded.width, height: changed ? canvas.height : decoded.height };
        }
        if (fallbackType === 'image/png') break;
      }
      if (edge <= minEdge) break;
      edge = Math.max(minEdge, Math.floor(edge * .85));
    }
    throw Error('Foto terlalu kompleks untuk batas ukuran yang aman. Gunakan foto lebih sederhana; foto lama tetap tersimpan.');
  } finally { decoded.close(); }
}
