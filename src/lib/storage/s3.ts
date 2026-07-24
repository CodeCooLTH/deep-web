import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuid } from "uuid";
import { validateUpload, fileIdExt, type Storage } from "./types";

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

  const ext = file.name.split(".").pop() || "bin";
  const fileId = `${uuid()}.${ext}`;
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

export const getFileUrl: Storage["getFileUrl"] = async (fileId, opts) => {
  const publicUrl = process.env.S3_PUBLIC_URL;

  if (!opts?.signed && publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${fileId}`;
  }

  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: getBucket(), Key: fileId }),
    { expiresIn: opts?.expiresIn ?? 3600 }
  );
};

export const deleteFile: Storage["deleteFile"] = async (fileId) => {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: fileId })
  );
};
