import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const zipPath = path.resolve('dukaan-live-server.zip');
const distDir = path.resolve('dist');

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// Let's create standard zip with forward slashes
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', function () {
  console.log(`✅ dukaan-live-server.zip created successfully (${archive.pointer()} total bytes)`);
});

archive.on('error', function (err) {
  throw err;
});

archive.pipe(output);

// Append files from dist/ with forward slashes
archive.directory(distDir, false);

archive.finalize();
