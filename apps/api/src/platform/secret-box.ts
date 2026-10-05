import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * Field-level encryption for secrets stored in the database (spec section L), with
 * AES-256-GCM. Values are "v1.<iv>.<tag>.<ciphertext>" in base64url, so the key or the
 * algorithm can change later without ambiguity.
 */

const VERSION = 'v1';

export class SecretBox {
  private readonly indexKey: Buffer;

  private constructor(private readonly key: Buffer) {
    // A separate subkey, so the keyed hash and the encryption never share key material.
    this.indexKey = Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'blind-index', 32));
  }

  /** From a base64-encoded 32-byte key, as printed by auth:keygen. */
  static fromBase64(value: string): SecretBox {
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32) throw new Error('The encryption key must be 32 bytes, base64-encoded.');
    return new SecretBox(key);
  }

  /** A fixed key for development only, derived from a public phrase. Never for real data. */
  static development(): SecretBox {
    return new SecretBox(createHash('sha256').update('dental-platform development key').digest());
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), ciphertext]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  /**
   * A keyed hash for exact matching on an encrypted value (a blind index). Without the key it
   * reveals nothing, even for low-entropy values such as national ID numbers.
   */
  index(value: string): string {
    return createHmac('sha256', this.indexKey).update(value).digest('hex');
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, ciphertext] = sealed.split('.');
    if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
      throw new Error('Unrecognised encrypted value');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
