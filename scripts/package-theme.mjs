import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';
import { load as parseYaml } from 'js-yaml';

const legacyFontPaths = [
  'templates/assets/lib/font-awesome/fonts/FontAwesome.otf',
  'templates/assets/lib/font-awesome/fonts/fontawesome-webfont.eot',
  'templates/assets/lib/font-awesome/fonts/fontawesome-webfont.svg',
  'templates/assets/lib/font-awesome/fonts/fontawesome-webfont.ttf',
  'templates/assets/lib/font-awesome/fonts/fontawesome-webfont.woff',
];
const guardedFontAwesomePaths = [
  'templates/assets/lib/font-awesome/css/font-awesome.min.css',
  'templates/assets/lib/font-awesome/fonts/fontawesome-webfont.woff2',
];

const projectRoot = resolve('.');
const theme = parseYaml(readFileSync(resolve(projectRoot, 'theme.yaml'), 'utf8'));
const zipName = `${theme.metadata.name}-${theme.spec.version}.zip`;
const distDirectory = resolve(projectRoot, 'dist');
const zipPath = resolve(distDirectory, zipName);
const stagingDirectory = mkdtempSync(join(tmpdir(), 'joe-theme-package-'));
const publishTempPath = resolve(distDirectory, `.${zipName}.${randomUUID()}.tmp`);

const copyIfPresent = (path) => {
  const source = resolve(projectRoot, path);
  if (existsSync(source)) cpSync(source, resolve(stagingDirectory, path), { recursive: true });
};

const validateArchive = (entries) => {
  const remainingLegacyFonts = legacyFontPaths.filter((path) => entries[path] != null);
  if (remainingLegacyFonts.length > 0) {
    throw new Error(`legacy Font Awesome assets remain: ${remainingLegacyFonts.join(', ')}`);
  }
  for (const path of guardedFontAwesomePaths) {
    const packagedFile = entries[path];
    if (packagedFile == null) throw new Error(`theme package is missing ${path}`);
    const sourceFile = readFileSync(resolve(projectRoot, path));
    if (!Buffer.from(packagedFile).equals(sourceFile)) {
      throw new Error(`theme package ${path} does not match its source file`);
    }
  }
};

try {
  for (const path of ['templates', 'ui-plugin/dist', 'i18n']) copyIfPresent(path);
  for (const entry of readdirSync(projectRoot, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      (entry.name === 'README.md' ||
        entry.name === 'LICENSE' ||
        /\.(?:yaml|yml)$/.test(entry.name) ||
        /^screenshot\.(?:png|jpe?g|webp)$/.test(entry.name))
    ) {
      copyIfPresent(entry.name);
    }
  }

  const themePackageCli = resolve(projectRoot, 'node_modules/@halo-dev/theme-package-cli/index.js');
  execFileSync(process.execPath, [themePackageCli], { cwd: stagingDirectory, stdio: 'pipe' });

  const stagedZipPath = resolve(stagingDirectory, 'dist', zipName);
  const entries = unzipSync(readFileSync(stagedZipPath));
  for (const path of legacyFontPaths) delete entries[path];
  validateArchive(entries);

  const archive = Buffer.from(zipSync(entries, { level: 9 }));
  validateArchive(unzipSync(archive));
  mkdirSync(distDirectory, { recursive: true });
  writeFileSync(publishTempPath, archive, { flag: 'wx' });
  validateArchive(unzipSync(readFileSync(publishTempPath)));

  renameSync(publishTempPath, zipPath);
  console.log(`✅ Packaged successfully: ${zipPath}`);
  console.log(`Theme version: ${theme.spec.version}`);
  console.log(`File size: ${(archive.length / 1024 / 1024).toFixed(2)} MB`);
} finally {
  rmSync(publishTempPath, { force: true });
  rmSync(stagingDirectory, { recursive: true, force: true });
}
