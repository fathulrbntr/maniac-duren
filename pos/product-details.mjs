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
export { preparePhoto } from "../shared/photo.mjs?v=28";
