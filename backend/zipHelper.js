const zlib = require('zlib');
const path = require('path');

// Bảng tra cứu CRC32 chuẩn (IEEE 802.3 / ISO 3309)
const makeCrcTable = () => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
};
const crcTable = makeCrcTable();

function calculateCrc32(buf) {
    if (typeof zlib.crc32 === 'function') {
        return zlib.crc32(buf) >>> 0;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function getDosDateTime(date = new Date()) {
    const d = (date instanceof Date && !isNaN(date)) ? date : new Date();
    const year = Math.max(1980, d.getFullYear());
    const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xFFFF;
    const dosDate = (((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    return { dosTime, dosDate };
}

/**
 * Nén danh sách tệp thành định dạng chuẩn PKZIP (.zip)
 * Không phụ thuộc vào thư viện ngoài, tương thích 100% với Windows Explorer, macOS, WinRAR, 7-Zip.
 * 
 * @param {Array<{ name: string, data: Buffer | string, date?: Date }>} entries 
 * @returns {Buffer}
 */
function createZipBuffer(entries = []) {
    const localHeadersAndData = [];
    const centralDirectoryHeaders = [];
    let currentOffset = 0;
    const { dosTime, dosDate } = getDosDateTime();
    const usedNames = new Set();

    for (const entry of entries) {
        let entryName = (entry.name || 'file.csv').replace(/\\/g, '/').replace(/^\/+/, '');
        
        // Đảm bảo không trùng tên tệp trong kho lưu trữ ZIP
        if (usedNames.has(entryName)) {
            const ext = path.extname(entryName);
            const base = path.basename(entryName, ext);
            let counter = 1;
            while (usedNames.has(`${base}_(${counter})${ext}`)) {
                counter++;
            }
            entryName = `${base}_(${counter})${ext}`;
        }
        usedNames.add(entryName);

        const uncompressedBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || '', 'utf8');
        const uncompressedSize = uncompressedBuf.length;
        const crc = calculateCrc32(uncompressedBuf);

        let method = 8; // DEFLATE
        let compressedBuf = zlib.deflateRawSync(uncompressedBuf, { level: 6 });
        // Nếu nén làm dung lượng tăng, lưu dạng STORE (không nén)
        if (compressedBuf.length >= uncompressedSize) {
            method = 0;
            compressedBuf = uncompressedBuf;
        }
        const compressedSize = compressedBuf.length;
        const nameBuf = Buffer.from(entryName, 'utf8');

        // 1. Local File Header (30 bytes + nameBuf.length + compressedSize)
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0); // Chữ ký Local File Header
        localHeader.writeUInt16LE(20, 4);         // Phiên bản cần thiết: 2.0
        localHeader.writeUInt16LE(0x0800, 6);     // Bit 11 bật để hỗ trợ UTF-8 cho tên file
        localHeader.writeUInt16LE(method, 8);     // Phương thức nén
        localHeader.writeUInt16LE(dosTime, 10);   // Giờ sửa đổi
        localHeader.writeUInt16LE(dosDate, 12);   // Ngày sửa đổi
        localHeader.writeUInt32LE(crc, 14);       // Checksum CRC-32
        localHeader.writeUInt32LE(compressedSize, 18);   // Kích thước nén
        localHeader.writeUInt32LE(uncompressedSize, 22); // Kích thước gốc
        localHeader.writeUInt16LE(nameBuf.length, 26);   // Độ dài tên file
        localHeader.writeUInt16LE(0, 28);                // Extra field length

        const localPart = Buffer.concat([localHeader, nameBuf, compressedBuf]);
        localHeadersAndData.push(localPart);

        // 2. Central Directory Header (46 bytes + nameBuf.length)
        const cdHeader = Buffer.alloc(46);
        cdHeader.writeUInt32LE(0x02014b50, 0);    // Chữ ký Central Directory
        cdHeader.writeUInt16LE(20, 4);            // Phiên bản tạo: 2.0 (DOS/FAT)
        cdHeader.writeUInt16LE(20, 6);            // Phiên bản cần thiết: 2.0
        cdHeader.writeUInt16LE(0x0800, 8);        // Bit 11 UTF-8
        cdHeader.writeUInt16LE(method, 10);       // Phương thức nén
        cdHeader.writeUInt16LE(dosTime, 12);      // Giờ
        cdHeader.writeUInt16LE(dosDate, 14);      // Ngày
        cdHeader.writeUInt32LE(crc, 16);          // CRC-32
        cdHeader.writeUInt32LE(compressedSize, 20);   // Kích thước nén
        cdHeader.writeUInt32LE(uncompressedSize, 24); // Kích thước gốc
        cdHeader.writeUInt16LE(nameBuf.length, 28);   // Độ dài tên file
        cdHeader.writeUInt16LE(0, 30);            // Extra field length
        cdHeader.writeUInt16LE(0, 32);            // File comment length
        cdHeader.writeUInt16LE(0, 34);            // Disk number start
        cdHeader.writeUInt16LE(0, 36);            // Internal file attributes
        cdHeader.writeUInt32LE(0x00000020, 38);   // External file attributes (DOS archive)
        cdHeader.writeUInt32LE(currentOffset, 42);// Offset của Local Header tương ứng

        centralDirectoryHeaders.push(Buffer.concat([cdHeader, nameBuf]));
        currentOffset += localPart.length;
    }

    const cdBuffer = Buffer.concat(centralDirectoryHeaders);
    const cdOffset = currentOffset;
    const cdSize = cdBuffer.length;
    const totalEntries = entries.length;

    // 3. End of Central Directory Record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // Chữ ký EOCD
    eocd.writeUInt16LE(0, 4);          // Disk number
    eocd.writeUInt16LE(0, 6);          // Start disk
    eocd.writeUInt16LE(totalEntries, 8);  // Số tệp trên disk này
    eocd.writeUInt16LE(totalEntries, 10); // Tổng số tệp trong thư mục trung tâm
    eocd.writeUInt32LE(cdSize, 12);       // Kích thước Central Directory
    eocd.writeUInt32LE(cdOffset, 16);     // Offset bắt đầu Central Directory
    eocd.writeUInt16LE(0, 20);            // Comment length

    return Buffer.concat([...localHeadersAndData, cdBuffer, eocd]);
}

module.exports = {
    createZipBuffer,
    calculateCrc32,
    getDosDateTime
};
