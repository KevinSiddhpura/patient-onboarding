import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const HASH_FORMAT = new RegExp(`^scrypt\\$[0-9a-f]{${SALT_LENGTH * 2}}\\$[0-9a-f]{${KEY_LENGTH * 2}}$`);

export async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [, salt, key] = stored.split("$");
  const expected = Buffer.from(key, "hex");
  const actual = await scrypt(password, Buffer.from(salt, "hex"), KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}

export function isPasswordHash(value) {
  return HASH_FORMAT.test(value);
}

const dummyHash = hashPassword(randomBytes(16).toString("hex"));

// Takes as long as a real check, so response time does not reveal which emails exist.
export async function burnPasswordCheck(password) {
  await verifyPassword(password, await dummyHash);
}
