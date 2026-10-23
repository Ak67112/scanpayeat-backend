/**
 * Table QR Code Encryption & Security Module (Backend)
 */

const SECRET_KEY = process.env.TABLE_SECRET || 'HOTELKADA_DINING_SEC_2026_SECURE_QR';

function fnv1a(str: string, seed: number = 0x811c9dc5): number {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

function generateKeystream(key: string, length: number): number[] {
  const bytes: number[] = [];
  let currentSeed = fnv1a(key);
  while (bytes.length < length) {
    currentSeed = fnv1a(`${key}:${bytes.length}`, currentSeed);
    bytes.push(currentSeed & 0xff);
    bytes.push((currentSeed >> 8) & 0xff);
    bytes.push((currentSeed >> 16) & 0xff);
    bytes.push((currentSeed >> 24) & 0xff);
  }
  return bytes.slice(0, length);
}

export function encodeTableToken(slug: string, tableNumber: string | number): string {
  const normSlug = (slug || '').toLowerCase().trim();
  const table = String(tableNumber).trim();
  const nonce = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

  const payload = `${table}|${normSlug}|${nonce}`;
  const payloadBytes: number[] = [];
  for (let i = 0; i < payload.length; i++) {
    payloadBytes.push(payload.charCodeAt(i));
  }

  const streamKey = `${SECRET_KEY}:${normSlug}:${nonce}`;
  const keystream = generateKeystream(streamKey, payloadBytes.length);
  const cipherHexArr: string[] = [];
  for (let i = 0; i < payloadBytes.length; i++) {
    const cipherByte = payloadBytes[i] ^ keystream[i];
    cipherHexArr.push(cipherByte.toString(16).padStart(2, '0'));
  }
  const cipherHex = cipherHexArr.join('');
  const sig = fnv1a(`${cipherHex}:${SECRET_KEY}:${normSlug}`).toString(16).padStart(8, '0');
  return `${nonce}${sig}${cipherHex}`;
}

export function decodeTableToken(
  slug: string,
  token: string | null | undefined
): { valid: boolean; table: string | null } {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, table: null };
    }

    const cleanToken = token.trim();
    if (cleanToken.length < 16) {
      return { valid: false, table: null };
    }

    const normSlug = (slug || '').toLowerCase().trim();
    const nonce = cleanToken.slice(0, 6);
    const sig = cleanToken.slice(6, 14);
    const cipherHex = cleanToken.slice(14);

    const expectedSig = fnv1a(`${cipherHex}:${SECRET_KEY}:${normSlug}`).toString(16).padStart(8, '0');
    if (sig.toLowerCase() !== expectedSig.toLowerCase()) {
      return { valid: false, table: null };
    }

    const streamKey = `${SECRET_KEY}:${normSlug}:${nonce}`;
    const cipherBytes: number[] = [];
    for (let i = 0; i < cipherHex.length; i += 2) {
      cipherBytes.push(parseInt(cipherHex.slice(i, i + 2), 16));
    }

    const keystream = generateKeystream(streamKey, cipherBytes.length);
    let plainText = '';
    for (let i = 0; i < cipherBytes.length; i++) {
      plainText += String.fromCharCode(cipherBytes[i] ^ keystream[i]);
    }

    const parts = plainText.split('|');
    if (parts.length !== 3) {
      return { valid: false, table: null };
    }

    const [table, embeddedSlug, embeddedNonce] = parts;
    if (embeddedSlug !== normSlug || embeddedNonce !== nonce) {
      return { valid: false, table: null };
    }

    return { valid: true, table: table.trim() };
  } catch {
    return { valid: false, table: null };
  }
}
