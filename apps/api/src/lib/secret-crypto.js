"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
const node_crypto_1 = require("node:crypto");
// Merchant secret'larını GERİ-DÖNDÜRÜLEBİLİR şekilde şifreler.
// keyId-only auth için gerekli: header'da secret gelmediğinden, HMAC'i
// doğrulamak üzere DB'den ham secret'ı çözebilmemiz gerekir.
// Saklanan format: ivHex:authTagHex:cipherHex  (AES-256-GCM)
//
// MERCHANT_SECRET_ENC_KEY env değişkeni ana anahtardır (32+ karakter).
const ALGO = 'aes-256-gcm';
function masterKey() {
    const raw = process.env.MERCHANT_SECRET_ENC_KEY;
    if (!raw || raw.length < 32) {
        throw new Error('MERCHANT_SECRET_ENC_KEY tanımlı değil veya 32 karakterden kısa.');
    }
    return (0, node_crypto_1.scryptSync)(raw, 'kipay-merchant-secret', 32);
}
function encryptSecret(plain) {
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)(ALGO, masterKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}
function decryptSecret(stored) {
    const [ivHex, tagHex, dataHex] = stored.split(':');
    if (!ivHex || !tagHex || !dataHex)
        throw new Error('Bozuk şifreli secret formatı.');
    const decipher = (0, node_crypto_1.createDecipheriv)(ALGO, masterKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
