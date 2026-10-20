// Thu nhỏ ảnh ngay trên trình duyệt trước khi gửi lên máy chủ: ảnh chụp điện thoại thường 3 đến 8MB, trong khi lệnh
// gửi lên CRM (server action) nhận tối đa vài MB (next.config.ts, Vercel giới hạn 4,5MB mỗi lần gửi). Ảnh đã nhỏ
// sẵn, hoặc trình duyệt không đọc được (HEIC trên Chrome, PDF), thì gửi nguyên file.

/** Ảnh dưới mức này và không quá cạnh dài thì gửi nguyên, không nén lại. */
const KEEP_BYTES = 900 * 1024;

const RESIZABLE = ["image/jpeg", "image/png", "image/webp"];

export async function shrinkImage(file: File, maxSide = 1600, quality = 0.85): Promise<File> {
  if (!RESIZABLE.includes(file.type) || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= KEEP_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // WEBP giữ được nền trong suốt của ảnh PNG; trình duyệt không xuất được WEBP thì dùng JPEG nền trắng.
  let blob = await toBlob(canvas, "image/webp", quality);
  if (!blob || blob.type !== "image/webp") {
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    blob = await toBlob(canvas, "image/jpeg", quality);
  }
  if (!blob || blob.size >= file.size) return file;
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const name = file.name.replace(/\.[^.]*$/, "") + "." + ext;
  return new File([blob], name, { type: blob.type });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
