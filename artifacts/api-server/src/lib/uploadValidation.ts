import type { uploadsTable } from "@workspace/db";

export const MAX_SCREENSHOT_BYTES = 25 * 1024 * 1024;

const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadRow = typeof uploadsTable.$inferSelect;

export interface StoredImageFile {
  getMetadata(): Promise<
    [{ size?: number | string; contentType?: string }, ...unknown[]]
  >;
  createReadStream(options?: { start?: number; end?: number }): NodeJS.ReadableStream;
}

export type VerifiedImage = {
  actualSize: number;
  detectedContentType: "image/jpeg" | "image/png" | "image/webp";
};

const extensionTypes: Record<string, VerifiedImage["detectedContentType"]> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function validateDeclaredImage(
  name: string,
  size: number,
  contentType: string,
): string | null {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  const expectedType = extensionTypes[extension];
  if (!expectedType || !supportedTypes.has(contentType)) {
    return "Разрешены только файлы JPG, PNG и WebP.";
  }
  if (expectedType !== contentType) {
    return "Тип файла не совпадает с его расширением.";
  }
  if (!Number.isInteger(size) || size < 1 || size > MAX_SCREENSHOT_BYTES) {
    return "Размер каждого изображения не должен превышать 25 МБ.";
  }
  return null;
}

function detectImageType(header: Buffer): VerifiedImage["detectedContentType"] | null {
  if (
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    header.length >= 8 &&
    header.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "image/png";
  }
  if (
    header.length >= 12 &&
    header.toString("ascii", 0, 4) === "RIFF" &&
    header.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function readHeader(file: StoredImageFile): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = file.createReadStream({ start: 0, end: 15 }) as NodeJS.ReadableStream;
    stream.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export async function verifyStoredImage(
  upload: UploadRow,
  file: StoredImageFile,
): Promise<{ verified: VerifiedImage } | { error: string }> {
  const declarationError = validateDeclaredImage(
    upload.originalName,
    upload.size,
    upload.contentType,
  );
  if (declarationError) {
    return { error: declarationError };
  }

  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size);
  if (
    !Number.isSafeInteger(actualSize) ||
    actualSize < 1 ||
    actualSize > MAX_SCREENSHOT_BYTES
  ) {
    return { error: "Фактический размер файла превышает допустимый лимит." };
  }
  if (actualSize !== upload.size) {
    return { error: "Фактический размер файла не совпадает с заявленным." };
  }

  const header = await readHeader(file);
  const detectedContentType = detectImageType(header);
  if (!detectedContentType || detectedContentType !== upload.contentType) {
    return {
      error:
        "Содержимое файла не является изображением заявленного типа. Исполняемые файлы и подмена формата запрещены.",
    };
  }
  if (
    metadata.contentType &&
    metadata.contentType !== detectedContentType
  ) {
    return { error: "Тип содержимого файла не совпадает с его сигнатурой." };
  }

  return { verified: { actualSize, detectedContentType } };
}

export function verifyImageBytes(
  upload: Pick<UploadRow, "originalName" | "size" | "contentType">,
  bytes: Buffer,
): { verified: VerifiedImage } | { error: string } {
  const declarationError = validateDeclaredImage(
    upload.originalName,
    upload.size,
    upload.contentType,
  );
  if (declarationError) return { error: declarationError };
  if (bytes.length !== upload.size) {
    return { error: "Фактический размер файла не совпадает с заявленным." };
  }
  const detectedContentType = detectImageType(bytes.subarray(0, 16));
  if (!detectedContentType || detectedContentType !== upload.contentType) {
    return {
      error:
        "Содержимое файла не является изображением заявленного типа. Исполняемые файлы и подмена формата запрещены.",
    };
  }
  return {
    verified: {
      actualSize: bytes.length,
      detectedContentType,
    },
  };
}
