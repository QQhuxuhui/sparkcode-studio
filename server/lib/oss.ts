// Aliyun OSS helper. Used ONLY by import scripts to upload thumbnails +
// example images. The runtime API never touches OSS — it just stores URLs.

import OSS from 'ali-oss';
import { env } from '../env.js';

let client: OSS | null = null;

export function getOSSClient(): OSS {
  if (!client) {
    if (!env.OSS_BUCKET || !env.OSS_ACCESS_KEY_ID || !env.OSS_ACCESS_KEY_SECRET) {
      throw new Error('OSS credentials missing — fill OSS_* vars in .env first');
    }
    client = new OSS({
      region:          env.OSS_REGION,
      bucket:          env.OSS_BUCKET,
      accessKeyId:     env.OSS_ACCESS_KEY_ID,
      accessKeySecret: env.OSS_ACCESS_KEY_SECRET,
      secure:          true,
    });
  }
  return client;
}

/**
 * Upload a buffer to OSS at the given object path. Returns the public URL.
 * If OSS_PUBLIC_PREFIX is set (CDN-bound domain), prefer that; otherwise
 * use the bucket-domain URL.
 */
export async function uploadToOSS(objectPath: string, buf: Buffer, contentType: string): Promise<string> {
  const c = getOSSClient();
  await c.put(objectPath, buf, {
    headers: {
      'Content-Type':     contentType,
      'x-oss-object-acl': 'public-read',
    },
  });
  if (env.OSS_PUBLIC_PREFIX) {
    return `${env.OSS_PUBLIC_PREFIX.replace(/\/$/, '')}/${objectPath}`;
  }
  return `https://${env.OSS_BUCKET}.${env.OSS_REGION}.aliyuncs.com/${objectPath}`;
}
