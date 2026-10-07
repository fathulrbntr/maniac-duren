// Normalize browser-decodable images before sending them to the database.
export async function loadPhoto(file) {
  if (!file || !file.size) throw Error('File foto kosong.');
  if (file.size > 50 * 1024 * 1024) throw Error('File sumber maksimal 50 MB.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(Error('Format foto tidak dapat dibaca browser. Untuk HEIC/HEIF, TIFF, atau RAW, konversikan ke JPG, PNG, atau WebP terlebih dahulu.'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw Error('Dimensi foto tidak valid.');
    return { image, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
export async function encodePhoto(canvas, maxBytes = 2 * 1024 * 1024) {
  const context = canvas.getContext('2d');
  if (!context) throw Error('Browser tidak mendukung pengolahan foto.');
  for (;;) {
    // WebP preserves transparency; PNG is the fallback on older browsers.
    for (const quality of [0.9, 0.8, 0.65, 0.5, 0.35]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob && ['image/webp', 'image/png', 'image/jpeg'].includes(blob.type) && blob.size <= maxBytes) {
        const photo = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(Error('Gagal membaca hasil foto.'));
          reader.readAsDataURL(blob);
        });
        return { photo, bytes: blob.size };
      }
    }
    if (Math.max(canvas.width, canvas.height) <= 128) throw Error('Foto gagal dikompres sesuai batas penyimpanan.');
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(1, Math.round(canvas.width * 0.75));
    smaller.height = Math.max(1, Math.round(canvas.height * 0.75));
    smaller.getContext('2d').drawImage(canvas, 0, 0, smaller.width, smaller.height);
    canvas.width = smaller.width;
    canvas.height = smaller.height;
    context.drawImage(smaller, 0, 0);
  }
}
export async function preparePhoto(file, { maxBytes = 2 * 1024 * 1024 } = {}) {
  const source = await loadPhoto(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1200 / Math.max(source.image.naturalWidth, source.image.naturalHeight));
    canvas.width = Math.max(1, Math.round(source.image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('Browser tidak mendukung pengolahan foto.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
    return await encodePhoto(canvas, maxBytes);
  } finally { source.close(); }
}
