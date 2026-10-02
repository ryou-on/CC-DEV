import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const expected = { jpn: '1f5de9236d2e85f5fdf4b3c500f2d4926f8d9449f28f5394472d9e8d83b91b4d', eng: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2' };
await mkdir('.ocr-data', { recursive: true });
for (const [language, checksum] of Object.entries(expected)) {
  const response = await fetch(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${language}.traineddata`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('OCR_MODEL_DOWNLOAD_FAILED');
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== checksum) throw new Error('OCR_MODEL_CHECKSUM_CHANGED');
  await writeFile(`.ocr-data/${language}.traineddata`, data);
  console.log(`OCR language installed: ${language}`);
}
