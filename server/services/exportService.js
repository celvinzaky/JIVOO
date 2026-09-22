/**
 * server/services/exportService.js
 * Streams a client's entire data folder as CLIENT_NAME_backup.zip
 * (master prompt §8.6). Read-only — never touches/deletes source files.
 */
const archiver = require('archiver');
const storage = require('./jsonStorage');

/**
 * Pipes a zip of data/clients/{clientId}/*.json into the given
 * writable stream (typically the HTTP response). Resolves when the
 * archive has finished writing, rejects on any archiver error.
 */
function streamClientBackup(clientId, writableStream) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });
    archive.on('error', reject);
    writableStream.on('close', resolve);
    writableStream.on('finish', resolve);

    archive.pipe(writableStream);
    archive.directory(storage.clientDirPath(clientId), false);
    archive.finalize();
  });
}

module.exports = { streamClientBackup };
