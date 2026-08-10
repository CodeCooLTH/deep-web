import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { validateUpload, fileIdExt, newFileId, type Storage } from "./types";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
}

let client: S3Client | undefined;
function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

function getBucket(): string {
  return requireEnv("S3_BUCKET");
}

export const saveFile: Storage["saveFile"] = async (file, opts) => {
  if (!opts?.skipValidation) validateUpload(file);

  const fileId = newFileId(file.name.split(".").pop() || "bin");
  const buffer = Buffer.from(await file.arrayBuffer());

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: fileId,
      Body: buffer,
      ContentType: file.type,
    })
  );

  return fileId;
};

/**
 * presigned PUT — client อัปโหลดเข้า Supabase Storage ตรง ๆ ไม่ผ่าน function ของเรา
 *
 * ยืนยันด้วยการยิงจริงกับ bucket prod (2026-08-10):
 *   - PUT 1MB → 200 และ HEAD อ่านขนาดได้ถูกต้อง
 *   - PUT 30MB → **413 EntityTooLarge และไฟล์ไม่ถูกเขียนลง bucket เลย** (HEAD = NotFound)
 *     คือ `file_size_limit` ของ bucket บังคับจริงบนเส้นทาง S3 ไม่ใช่แค่บน REST ของ Supabase
 *   - OPTIONS preflight จาก origin ของเรา → `access-control-allow-origin: *` + PUT อยู่ใน
 *     allow-methods (เบราว์เซอร์ยิงข้ามโดเมนได้ ไม่ต้องตั้ง CORS เพิ่ม)
 *
 * ContentType ถูกผนวกในลายเซ็น → client **ต้อง** ส่ง header `content-type` ค่าตรงกันเป๊ะ
 * ไม่งั้น S3 ปฏิเสธด้วย SignatureDoesNotMatch (ตั้งใจ: กันเปลี่ยนชนิดไฟล์หลังได้ลายเซ็นไปแล้ว)
 */
export const createUploadTicket: Storage["createUploadTicket"] = async ({
  ext,
  contentType,
  expiresIn,
}) => {
  const fileId = newFileId(ext);
  const url = await getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: getBucket(), Key: fileId, ContentType: contentType }),
    { expiresIn: Math.min(expiresIn, MAX_PRESIGNED_TTL) }
  );
  return { fileId, url, method: "PUT", headers: { "content-type": contentType } };
};

export const getFile: Storage["getFile"] = async (fileId) => {
  try {
    const response = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: fileId })
    );
    if (!response.Body) return null;

    const bytes = await response.Body.transformToByteArray();
    return { buffer: Buffer.from(bytes), ext: fileIdExt(fileId) };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "NoSuchKey") return null;
    throw err;
  }
};

/** S3 คืนชื่อ error ต่างกันตาม command: GetObject → NoSuchKey, HeadObject → NotFound
 *  (บาง S3-compatible ส่งมาแต่ httpStatusCode 404) — เช็คทั้งสามทางให้ครบ */
function isNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "NoSuchKey" || err.name === "NotFound") return true;
  const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return meta?.httpStatusCode === 404;
}

export const getFileMeta: Storage["getFileMeta"] = async (fileId) => {
  try {
    const response = await getClient().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: fileId })
    );
    return { size: response.ContentLength ?? 0, ext: fileIdExt(fileId) };
  } catch (err: unknown) {
    if (isNotFound(err)) return null;
    throw err;
  }
};

export const getFileRange: Storage["getFileRange"] = async (fileId, range) => {
  try {
    // ส่ง Range ต่อให้ S3 เลย — ไม่ดึงไฟล์ทั้งก้อนมาแล้วค่อยตัดในเมมโมรี
    // (วิดีโอ 25MB ที่ถูก seek ไปมาจะกินทั้ง bandwidth และ RAM ของ function โดยเปล่าประโยชน์)
    const response = await getClient().send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: fileId,
        Range: `bytes=${range.start}-${range.end}`,
      })
    );
    if (!response.Body) return null;

    const bytes = await response.Body.transformToByteArray();
    return { buffer: Buffer.from(bytes), ext: fileIdExt(fileId) };
  } catch (err: unknown) {
    if (isNotFound(err)) return null;
    throw err;
  }
};

/**
 * เพดานอายุของ presigned URL แบบ SigV4 = 7 วัน (ข้อจำกัดของ AWS ไม่ใช่ของเรา)
 *
 * ขอเกินนี้ `getSignedUrl` **โยน error ทิ้ง** ไม่ใช่คืนลิงก์ที่หมดอายุเร็วกว่าที่ขอ — พฤติกรรมนี้
 * ทำให้ feature ทั้งตัวตายเงียบมาแล้ว (กริดรูปในแชท ขอ 1 ปี → โยนทุกครั้ง → prod ตกไปส่งทีละใบ
 * ตั้งแต่วันแรกโดยไม่มีใครรู้ ดู channel-chat.service.ts ACTION_URL_TTL)
 *
 * clamp แทนการปล่อยให้โยน: ลิงก์ที่หมดอายุเร็วกว่าที่ขอ = เสื่อมทีละน้อยและเห็นได้ตอนกดจริง
 * ส่วนการโยน = ฟังก์ชันที่เรียกมันตายทั้งตัว ซึ่งแย่กว่ามากและวินิจฉัยยากกว่ามาก
 */
const MAX_PRESIGNED_TTL = 60 * 60 * 24 * 7;

export const getFileUrl: Storage["getFileUrl"] = async (fileId, opts) => {
  const publicUrl = process.env.S3_PUBLIC_URL;

  if (!opts?.signed && publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${fileId}`;
  }

  const requested = opts?.expiresIn ?? 3600;
  if (requested > MAX_PRESIGNED_TTL) {
    console.warn(
      `[storage] ขอ presigned URL อายุ ${requested}s เกินเพดาน SigV4 (${MAX_PRESIGNED_TTL}s) — ลดให้อัตโนมัติ`,
    );
  }

  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: getBucket(), Key: fileId }),
    { expiresIn: Math.min(requested, MAX_PRESIGNED_TTL) }
  );
};

export const deleteFile: Storage["deleteFile"] = async (fileId) => {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: fileId })
  );
};
