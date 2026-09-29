const crypto = require('crypto');

class Encryption {
    constructor(encryptionKey, iv) {
        this.encryptionKey = encryptionKey;
        this.iv = iv;
    }

    encrypt(data) {
        // Generate a random IV
        // let iv = crypto.randomBytes(16);
        const key = crypto.createHash('sha256').update(this.encryptionKey, 'utf-8').digest();

        //console.log('Hashed Key:', key.toString('base64'));


        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, Buffer.from(this.iv));
        let encryptedData = cipher.update(data, 'utf-8', 'base64');
        encryptedData += cipher.final('base64');;
        // console.log(encryptedData);
        return encryptedData;
    }

    decrypt(encryptedData) {
        // let iv = crypto.randomBytes(16);
        // Decode the base64 string to a Buffer
        //const encryptedBuffer = Buffer.from(encryptedData, 'base64').toString('utf-8');
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, Buffer.from(this.iv));
        let originalData = decipher.update(encryptedData, 'base64', 'utf-8') + decipher.final('utf-8');

        return originalData;
    }
}

// // Example usage
// const encryptionKey = 'D18AB5B0455AEC6D55K47FHRYS9ENVHD';
// const iv = 'abchefjhilklgbop';
// const yourEncryptionInstance = new YourEncryptionClass(encryptionKey, iv);

// const encryptedData = '97c9ih373IJF0zhV2jgDNQ==';
// const decryptedData = yourEncryptionInstance.decrypt(encryptedData);

// console.log(decryptedData);

module.exports = Encryption; 
