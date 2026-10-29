const ZIP_LIMIT = 0xffffffff;
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

async function crc32(blob) {
  let crc = 0xffffffff;
  const reader = blob.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const byte of value) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function localTimeAndDate(timestamp) {
  const date = new Date(timestamp);
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (date.getDate() << 0)
    | ((date.getMonth() + 1) << 5)
    | ((year - 1980) << 9);
  return { time, day };
}

function makeHeader(length, fields) {
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  for (const [offset, value, size] of fields) {
    if (size === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
  }
  return new Uint8Array(buffer);
}

function makeZipEntry(name, blob, timestamp, crc, offset) {
  if (blob.size > ZIP_LIMIT || offset > ZIP_LIMIT) {
    throw new Error("This recording set is too large for a single ZIP file.");
  }
  const nameBytes = new TextEncoder().encode(name);
  if (nameBytes.length > 0xffff) throw new Error("A recording filename is too long for ZIP export.");
  const { time, day } = localTimeAndDate(timestamp);
  const localHeader = makeHeader(30, [
    [0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2],
    [10, time, 2], [12, day, 2], [14, crc, 4], [18, blob.size, 4],
    [22, blob.size, 4], [26, nameBytes.length, 2], [28, 0, 2],
  ]);
  const centralHeader = makeHeader(46, [
    [0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2],
    [10, 0, 2], [12, time, 2], [14, day, 2], [16, crc, 4],
    [20, blob.size, 4], [24, blob.size, 4], [28, nameBytes.length, 2],
    [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4],
  ]);
  return {
    localParts: [localHeader, nameBytes, blob],
    centralParts: [centralHeader, nameBytes],
    localSize: localHeader.length + nameBytes.length + blob.size,
    centralSize: centralHeader.length + nameBytes.length,
  };
}

export async function createZipBlob(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let centralSize = 0;

  for (const file of files) {
    const checksum = await crc32(file.blob);
    const entry = makeZipEntry(file.name, file.blob, file.timestamp, checksum, offset);
    localParts.push(...entry.localParts);
    centralParts.push(...entry.centralParts);
    offset += entry.localSize;
    centralSize += entry.centralSize;
  }

  if (offset > ZIP_LIMIT || centralSize > ZIP_LIMIT || files.length > 0xffff) {
    throw new Error("This recording set is too large for a single ZIP file.");
  }
  const endRecord = makeHeader(22, [
    [0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2],
    [10, files.length, 2], [12, centralSize, 4], [16, offset, 4], [20, 0, 2],
  ]);
  return new Blob([...localParts, ...centralParts, endRecord], { type: "application/zip" });
}
