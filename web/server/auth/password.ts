import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify<string, string, number, typeof options, Buffer>(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export function usernameValue(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{3,64}$/.test(value))
    throw new Error('Tên đăng nhập cần 3–64 ký tự: chữ, số, _, . hoặc -.');
  return value.toLowerCase();
}
export async function hashPassword(password: unknown) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128)
    throw new Error('Mật khẩu cần từ 12 đến 128 ký tự.');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, options);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string | null | undefined) {
  const [algorithm, salt, hex] = (encoded || '').split('$');
  const valid =
    algorithm === 'scrypt' &&
    /^[a-f0-9]{32}$/.test(salt || '') &&
    /^[a-f0-9]{128}$/.test(hex || '');
  // Unknown users incur the same password derivation cost.
  const key = await derive(password, valid ? salt : '0'.repeat(32), 64, options);
  return timingSafeEqual(key, Buffer.from(valid ? hex : '0'.repeat(128), 'hex')) && valid;
}
