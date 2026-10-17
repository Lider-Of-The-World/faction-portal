import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { File, Storage } from "@google-cloud/storage";

import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const DROPBOX_API_ENDPOINT = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_ENDPOINT = "https://content.dropboxapi.com/2";
const MAX_DROPBOX_OBJECT_BYTES = 25 * 1024 * 1024;

type DropboxMetadata = {
  name?: string;
  size?: number;
  contentType?: string;
};

export type ObjectStorageFile = File | DropboxStoredFile;

let cachedDropboxToken: { token: string; expiresAt: number } | undefined;
let tokenRefresh: Promise<string> | undefined;

export const objectStorageClient = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: 'external_account',
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: 'json',
        subject_token_field_name: 'access_token',
      },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

export class DropboxStoredFile {
  constructor(
    readonly objectPath: string,
    private readonly metadata: DropboxMetadata,
  ) {}

  async getMetadata(): Promise<[DropboxMetadata]> {
    return [this.metadata];
  }

  createReadStream(): Readable {
    const file = this;
    return Readable.from(
      (async function* () {
        yield await downloadDropboxObject(file.objectPath);
      })(),
    );
  }
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export function getObjectStorageProvider(): "dropbox" | "replit" {
  const configuredProvider = process.env.OBJECT_STORAGE_PROVIDER?.trim().toLowerCase();
  if (configuredProvider === "dropbox" || configuredProvider === "replit") {
    return configuredProvider;
  }
  if (configuredProvider) {
    throw new Error("OBJECT_STORAGE_PROVIDER must be either 'dropbox' or 'replit'.");
  }
  return process.env.REPL_ID ? "replit" : "dropbox";
}

export function getDropboxMissingEnvironment(): string[] {
  return ["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET", "DROPBOX_REFRESH_TOKEN"].filter(
    (key) => !process.env[key]?.trim(),
  );
}

export function validateProductionEnvironment(): string[] {
  const missing: string[] = [];
  for (const key of ["SESSION_SECRET", "CRON_SECRET"]) {
    if ((process.env[key]?.length ?? 0) < 32) missing.push(`${key} (minimum 32 characters)`);
  }
  if (getObjectStorageProvider() === "dropbox") {
    missing.push(...getDropboxMissingEnvironment());
    try {
      getDropboxRootPath();
    } catch {
      missing.push("DROPBOX_ROOT_PATH (invalid Dropbox path)");
    }
  } else {
    for (const key of ["PRIVATE_OBJECT_DIR"]) {
      if (!process.env[key]?.trim()) missing.push(key);
    }
  }
  return missing;
}

function getDropboxRootPath(): string {
  const root = (process.env.DROPBOX_ROOT_PATH || "/FactionControl/screenshots")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  if (!root.startsWith("/") || root.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("DROPBOX_ROOT_PATH must be an absolute Dropbox path without dot segments.");
  }
  return root;
}

function getDropboxPath(objectPath: string): string {
  if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
  const relative = objectPath.slice("/objects/".length);
  const segments = relative.split("/");
  if (
    !relative ||
    segments.some((part) => !part || part === "." || part === "..")
  ) {
    throw new ObjectNotFoundError();
  }
  return `${getDropboxRootPath()}/${relative}`;
}

async function getDropboxAccessToken(): Promise<string> {
  if (cachedDropboxToken && cachedDropboxToken.expiresAt > Date.now() + 60_000) {
    return cachedDropboxToken.token;
  }
  if (tokenRefresh) return tokenRefresh;

  tokenRefresh = (async () => {
    const missing = getDropboxMissingEnvironment();
    if (missing.length) {
      throw new Error(`Dropbox storage is missing required environment variables: ${missing.join(", ")}.`);
    }

    const response = await fetch("https://api.dropbox.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.DROPBOX_REFRESH_TOKEN!,
        client_id: process.env.DROPBOX_APP_KEY!,
        client_secret: process.env.DROPBOX_APP_SECRET!,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Dropbox access-token refresh failed (HTTP ${response.status}).`);
    }
    const result = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!result.access_token || !result.expires_in) {
      throw new Error("Dropbox returned an invalid access-token response.");
    }
    cachedDropboxToken = {
      token: result.access_token,
      expiresAt: Date.now() + result.expires_in * 1000,
    };
    return result.access_token;
  })();

  try {
    return await tokenRefresh;
  } finally {
    tokenRefresh = undefined;
  }
}

async function getDropboxMetadata(objectPath: string): Promise<DropboxMetadata> {
  const response = await fetch(`${DROPBOX_API_ENDPOINT}/files/get_metadata`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getDropboxAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: getDropboxPath(objectPath) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 409 || response.status === 404) {
    throw new ObjectNotFoundError();
  }
  if (!response.ok) {
    throw new Error(`Dropbox metadata request failed (HTTP ${response.status}).`);
  }
  const metadata = (await response.json()) as DropboxMetadata;
  return metadata;
}

async function downloadDropboxObject(objectPath: string): Promise<Buffer> {
  const response = await fetch(`${DROPBOX_CONTENT_ENDPOINT}/files/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getDropboxAccessToken()}`,
      "Dropbox-API-Arg": JSON.stringify({ path: getDropboxPath(objectPath) }),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 409 || response.status === 404) {
    throw new ObjectNotFoundError();
  }
  if (!response.ok) {
    throw new Error(`Dropbox download failed (HTTP ${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_DROPBOX_OBJECT_BYTES) {
    throw new Error("Dropbox object exceeds the configured screenshot size limit.");
  }
  return bytes;
}

export class ObjectStorageService {
  constructor() {}

  isDropboxEnabled(): boolean {
    return getObjectStorageProvider() === "dropbox";
  }

  async createUploadTarget(
    uploadId: string,
  ): Promise<{ uploadURL: string; objectPath: string }> {
    if (this.isDropboxEnabled()) {
      return {
        uploadURL: `/api/storage/uploads/transfer/${encodeURIComponent(uploadId)}`,
        objectPath: `/objects/uploads/${uploadId}`,
      };
    }
    const uploadURL = await this.getObjectEntityUploadURL(uploadId);
    const objectPath = this.normalizeObjectEntityPath(uploadURL);
    return { uploadURL, objectPath };
  }

  async storeObject(
    objectPath: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<void> {
    if (!this.isDropboxEnabled()) {
      const { bucketName, objectName } = parseObjectPath(
        `${this.getPrivateObjectDir()}${objectPath.slice("/objects".length)}`,
      );
      await objectStorageClient.bucket(bucketName).file(objectName).save(bytes, {
        resumable: false,
        metadata: { contentType, cacheControl: "private, no-store" },
      });
      return;
    }

    const response = await fetch(`${DROPBOX_CONTENT_ENDPOINT}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getDropboxAccessToken()}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: getDropboxPath(objectPath),
          mode: "overwrite",
          autorename: false,
          mute: true,
        }),
      },
      body: bytes,
      signal: AbortSignal.timeout(45_000),
    });
    if (response.status === 409) {
      throw new Error("Dropbox already contains an object at the requested path.");
    }
    if (!response.ok) {
      throw new Error(`Dropbox upload failed (HTTP ${response.status}).`);
    }
  }

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const paths = Array.from(
      new Set(
        pathsStr
          .split(',')
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          'tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths).',
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || '';
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          'tool and set PRIVATE_OBJECT_DIR env var.',
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(
    file: ObjectStorageFile,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy =
      file instanceof DropboxStoredFile ? null : await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === 'public';

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      'Content-Type':
        (metadata.contentType as string) || 'application/octet-stream',
      'Cache-Control': `${isPublic ? 'public' : 'private'}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers['Content-Length'] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(uploadId?: string): Promise<string> {
    if (this.isDropboxEnabled()) {
      if (!uploadId) throw new Error("A database upload id is required for Dropbox storage.");
      return `/api/storage/uploads/transfer/${encodeURIComponent(uploadId)}`;
    }
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          'tool and set PRIVATE_OBJECT_DIR env var.',
      );
    }

    const objectId = uploadId || randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: 'PUT',
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<ObjectStorageFile> {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }

    if (this.isDropboxEnabled()) {
      const metadata = await getDropboxMetadata(objectPath);
      if (
        !Number.isSafeInteger(metadata.size) ||
        (metadata.size as number) < 1 ||
        (metadata.size as number) > MAX_DROPBOX_OBJECT_BYTES
      ) {
        throw new Error("Dropbox object has an invalid screenshot size.");
      }
      return new DropboxStoredFile(objectPath, metadata);
    }

    const parts = objectPath.slice(1).split('/');
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join('/');
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith('/')) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith('https://storage.googleapis.com/')) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith('/')) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith('/')) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    if (objectFile instanceof DropboxStoredFile) {
      throw new Error("Dropbox object ACL metadata is not supported.");
    }
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  const pathParts = path.split('/');
  if (pathParts.length < 3) {
    throw new Error('Invalid path: must contain at least a bucket name');
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`,
    );
  }

  const { signed_url: signedURL } = (await response.json()) as {
    signed_url: string;
  };
  return signedURL;
}
