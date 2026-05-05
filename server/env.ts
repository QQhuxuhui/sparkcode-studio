import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

export const env = {
  PORT:                 Number(process.env.PORT || 3001),
  DATABASE_URL:         required('DATABASE_URL'),
  OSS_REGION:           process.env.OSS_REGION       || 'oss-cn-shanghai',
  OSS_BUCKET:           process.env.OSS_BUCKET       || '',
  OSS_ACCESS_KEY_ID:    process.env.OSS_ACCESS_KEY_ID    || '',
  OSS_ACCESS_KEY_SECRET:process.env.OSS_ACCESS_KEY_SECRET|| '',
  OSS_PUBLIC_PREFIX:    process.env.OSS_PUBLIC_PREFIX    || '',
};
