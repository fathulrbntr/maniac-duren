// Read the middle of each frame locally; a lookup never sends images to the server.
export async function cameraDecoder() {
  const {
    BinaryBitmap,
    HybridBinarizer,
    HTMLCanvasElementLuminanceSource,
    Code128Reader,
    EAN13Reader,
    EAN8Reader,
    Code39Reader,
    ITFReader,
  } = await import("./vendor/barcode-reader.mjs");
  const readers = [
    new Code128Reader(),
    new EAN13Reader(),
    new EAN8Reader(),
    new Code39Reader(),
    new ITFReader(),
  ];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw Error("Kamera tidak dapat membaca gambar pada perangkat ini.");
  return (video) => {
    if (video.readyState < 2 || !video.videoWidth) return;
    const width = Math.min(1200, video.videoWidth);
    const sourceHeight = Math.min(video.videoHeight, Math.round(video.videoWidth * 0.35));
    const height = Math.max(1, Math.round((sourceHeight * width) / video.videoWidth));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.drawImage(
      video,
      0,
      (video.videoHeight - sourceHeight) / 2,
      video.videoWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    );
    const image = new BinaryBitmap(
      new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas)),
    );
    for (const reader of readers) {
      try {
        return reader.decode(image).getText();
      } catch (error) {
        // A frame with no readable barcode is normal while positioning the label.
        if (
          !["NotFoundException", "ChecksumException", "FormatException"].includes(
            error.getKind?.() || error.name,
          )
        )
          throw error;
      }
    }
  };
}
