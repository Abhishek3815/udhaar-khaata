import fs from 'fs';
import path from 'path';

const distApi = path.resolve('dist', 'api');
const srcApi = path.resolve('api');

if (!fs.existsSync(distApi)) {
  fs.mkdirSync(distApi, { recursive: true });
}

fs.cpSync(srcApi, distApi, { recursive: true });

const htaccessSrc = path.resolve('public', '.htaccess');
const htaccessDest = path.resolve('dist', '.htaccess');
if (fs.existsSync(htaccessSrc)) {
  fs.copyFileSync(htaccessSrc, htaccessDest);
}

// Copy install.php to dist/ for 1-click web installation on hosting
const installSrc = path.resolve('install.php');
const installDest = path.resolve('dist', 'install.php');
if (fs.existsSync(installSrc)) {
  fs.copyFileSync(installSrc, installDest);
}

// Copy schema.sql to dist/
const schemaSrc = path.resolve('schema.sql');
const schemaDest = path.resolve('dist', 'schema.sql');
if (fs.existsSync(schemaSrc)) {
  fs.copyFileSync(schemaSrc, schemaDest);
}

// Copy index.php (auto db check & routing) to dist/
const indexPhpSrc = path.resolve('index.php');
const indexPhpDest = path.resolve('dist', 'index.php');
if (fs.existsSync(indexPhpSrc)) {
  fs.copyFileSync(indexPhpSrc, indexPhpDest);
}

// Ensure clean installation state for live deployment zip: remove lock files from dist/
// This ensures that when unzipped on a fresh live server, the 1-Click Installation Wizard (install.php) opens automatically!
['installed.lock', 'install.lock'].forEach(lf => {
  const dest = path.resolve('dist', lf);
  if (fs.existsSync(dest)) {
    fs.unlinkSync(dest);
  }
});

console.log('✅ PHP API, index.php, install.php, schema.sql and .htaccess copied to dist/ for Shared Hosting (cPanel)');
