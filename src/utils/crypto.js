// Cifrado simétrico para tokens sensibles (OAuth tokens de Mercado Pago, etc).
// AES-256-GCM con IV aleatorio por operación.
//
// La clave maestra se deriva con scrypt desde process.env.ENCRYPTION_KEY.
// Si ENCRYPTION_KEY no está seteada, lanza error en producción y warn en dev.
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;          // 256 bits
const IV_LENGTH = 12;           // recomendado para GCM
const SALT = 'controlalo-mp-v1'; // salt fijo: el secreto vive en ENCRYPTION_KEY

let derivedKey = null;

function getKey() {
    if (derivedKey) return derivedKey;
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('ENCRYPTION_KEY missing in production. Set it in .env.');
        }
        console.warn('[crypto] ENCRYPTION_KEY no seteada — usando default inseguro (sólo dev).');
        derivedKey = crypto.scryptSync('dev-insecure-default', SALT, KEY_LENGTH);
        return derivedKey;
    }
    derivedKey = crypto.scryptSync(secret, SALT, KEY_LENGTH);
    return derivedKey;
}

function encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined) return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // formato: iv:tag:ciphertext (todos en hex)
    return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decrypt(payload) {
    if (!payload) return null;
    const [ivHex, tagHex, ctHex] = payload.split(':');
    if (!ivHex || !tagHex || !ctHex) throw new Error('Formato de cifrado inválido');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ct = Buffer.from(ctHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt };
