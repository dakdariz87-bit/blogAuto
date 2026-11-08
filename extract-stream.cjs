const fs = require('node:fs');
const path = require('node:path');
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

// Report bytes after each write completes. A single large entry can take minutes.
async function extractZip({ zip, directory, yauzl, onProgress = () => {}, openOutput = file => fs.createWriteStream(file) }) {
  const archive = await new Promise((resolve, reject) => yauzl.open(zip, { lazyEntries: true }, (error, value) => error ? reject(error) : resolve(value)));
  let bytes = 0, files = 0;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = error => { if (settled) return; settled = true; archive.close(); reject(error); };
    archive.on('error', fail);
    archive.on('end', () => { if (!settled) { settled = true; resolve({ bytes, files }); } });
    archive.on('entry', entry => {
      (async () => {
        const target = path.resolve(directory, entry.fileName);
        if (!target.startsWith(path.resolve(directory) + path.sep)) throw new Error('압축 파일 경로가 설치 폴더를 벗어납니다.');
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (mode === 0xa000) throw new Error('설치 압축 파일에 심볼릭 링크가 있습니다.');
        onProgress({ type: 'entry', file: entry.fileName, bytes, files });
        if (entry.fileName.endsWith('/')) await fs.promises.mkdir(target, { recursive: true });
        else {
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          const input = await new Promise((res, rej) => archive.openReadStream(entry, (error, stream) => error ? rej(error) : res(stream)));
          const output = openOutput(target);
          // Use a Writable that acknowledges the underlying write, respecting disk backpressure.
          const writer = new Writable({
            write(chunk, encoding, callback) {
              output.write(chunk, error => {
                if (!error) { bytes += chunk.length; onProgress({ type: 'bytes', file: entry.fileName, bytes, files }); }
                callback(error);
              });
            },
            final(callback) { output.end(callback); },
            destroy(error, callback) { output.destroy(); callback(error); }
          });
          output.on('error', error => writer.destroy(error));
          await pipeline(input, writer);
          files++;
        }
        if (!settled) archive.readEntry();
      })().catch(fail);
    });
    archive.readEntry();
  });
}
module.exports = { extractZip };
