import crypto from 'crypto';
import { env } from '../config/env';

// Derive 32-byte key from JWT_ACCESS_SECRET
const ENCRYPTION_SALT = 'scanpayeat-gateway-salt-v1';
const encryptionKey = crypto.scryptSync(
  env.JWT_ACCESS_SECRET || 'fallback-secret-for-encryption-scanpayeat',
  ENCRYPTION_SALT,
  32
);

/**
 * Encrypt a secret using AES-256-GCM authenticated encryption
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  // If already encrypted, return as is
  if (plainText.startsWith('enc:')) return plainText;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted secret safely
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  if (!encryptedPayload.startsWith('enc:')) {
    // Plaintext fallback (e.g. env fallback or legacy unencrypted)
    return encryptedPayload;
  }

  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 4) return encryptedPayload;
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const cipherText = parts[3];

    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt secret:', err);
    return encryptedPayload;
  }
}

/**
 * Mask secret string for safe display to client
 */
export function maskSecret(secret?: string | null): string {
  if (!secret) return '';
  const decrypted = decryptSecret(secret);
  if (!decrypted) return '';
  if (decrypted.length <= 4) return '••••';
  return '••••••••' + decrypted.slice(-4);
}
