const SIZE = 128;
/** The server accepts up to 40,000 characters; stay well under it. */
const MAX_CHARS = 30_000;

/**
 * Turns a photo from the camera or gallery into a small square thumbnail (a JPEG as text), cropped from the centre.
 * Phone photos are several MB; the thumbnail is about 5 to 8 KB, so it can live inside the item, work offline, be
 * included in the backup file and sync with the item like any other detail.
 */
export async function photoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That photo can't be read. Please try another one.");
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error("This browser can't process photos.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  context.fillStyle = '#fff'; // transparent PNGs would otherwise turn black as a JPEG
  context.fillRect(0, 0, SIZE, SIZE);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();

  for (const quality of [0.8, 0.65, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_CHARS) return url;
  }
  throw new Error('That photo is too detailed to shrink. Please try another one.');
}
