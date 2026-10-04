export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export function photoValue(value = "") {
  const photo = String(value || "");
  if (!photo) return "";
  const match = photo.match(
    /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match || match[1].length % 4 !== 0)
    throw Error("Foto harus JPG, PNG, atau WebP");
  const bytes =
    (match[1].length * 3) / 4 -
    (match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0);
  if (bytes > MAX_PHOTO_BYTES) throw Error("Foto maksimal 2 MB");
  return photo;
}
export function productDetails(p) {
  const variant = String(p.variant || "").trim(),
    barcode = String(p.barcode || "").trim();
  if (variant.length > 100 || barcode.length > 80)
    throw Error(
      "Variant maksimal 100 karakter dan barcode maksimal 80 karakter",
    );
  const buyPrice =
    p.buyPrice == null || p.buyPrice === "" ? null : Number(p.buyPrice);
  if (
    buyPrice !== null &&
    (!Number.isFinite(buyPrice) || buyPrice < 0 || buyPrice > 1e12)
  )
    throw Error("Harga beli harus 0–1 triliun");
  return { variant, barcode, buyPrice, photo: photoValue(p.photo) };
}
export async function preparePhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Pilih foto JPG, PNG, atau WebP");
  if (file.size > 20 * 1024 * 1024)
    throw Error("File sumber maksimal 20 MB sebelum kompresi");
  const url = URL.createObjectURL(file),
    img = new Image();
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(Error("Foto tidak dapat dibaca"));
      img.src = url;
    });
    const canvas = document.createElement("canvas"),
      scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("Browser tidak mendukung pengolahan foto");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5, 0.35]) {
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (blob && blob.size <= MAX_PHOTO_BYTES) {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(Error("Gagal membaca foto"));
          reader.readAsDataURL(blob);
        });
        return { photo: photoValue(data), bytes: blob.size };
      }
    }
    throw Error("Foto masih melebihi 2 MB. Pilih foto yang lebih kecil.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
