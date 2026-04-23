const fs = require('fs');
const path = require('path');

function removeDirIfExists(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function copyPath(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function copyIntoApp(rootDir, appDir, relativePath) {
  const src = path.join(rootDir, relativePath);
  const dest = path.join(appDir, relativePath);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required path: ${relativePath}`);
  }
  copyPath(src, dest);
}

async function applyExeIcon(rootDir, exePath) {
  const iconPath = path.join(rootDir, 'build', 'icon.ico');
  if (!fs.existsSync(iconPath)) return;

  try {
    const rcedit = require('rcedit');
    await rcedit(exePath, { icon: iconPath });
    process.stdout.write(`Applied icon to ${exePath}\n`);
  } catch (err) {
    process.stderr.write(`Warning: could not apply .exe icon automatically: ${err.message}\n`);
  }
}

async function buildPortable() {
  const rootDir = path.resolve(__dirname, '..');
  const electronDistDir = path.join(rootDir, 'node_modules', 'electron', 'dist');
  const outputDir = path.join(rootDir, 'dist', 'HydroInspect-win32-x64');
  const appDir = path.join(outputDir, 'resources', 'app');

  const sourceElectronExe = path.join(electronDistDir, 'electron.exe');
  if (!fs.existsSync(sourceElectronExe)) {
    throw new Error(`Electron runtime not found at ${sourceElectronExe}. Run: node node_modules/electron/install.js`);
  }

  removeDirIfExists(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  // 1) Copy Electron runtime files.
  copyPath(electronDistDir, outputDir);

  // 2) Rename executable.
  const targetExe = path.join(outputDir, 'HydroInspect.exe');
  fs.renameSync(path.join(outputDir, 'electron.exe'), targetExe);
  await applyExeIcon(rootDir, targetExe);

  // 3) Copy app payload into resources/app.
  fs.mkdirSync(appDir, { recursive: true });
  [
    'index.html',
    'manifest.json',
    'sw.js',
    'firestore.rules',
    'css',
    'js',
    'icons',
    'electron'
  ].forEach((relativePath) => copyIntoApp(rootDir, appDir, relativePath));

  // 4) Minimal runtime package.json for Electron entry point.
  const runtimePackageJson = {
    name: 'hydroinspect-desktop-runtime',
    version: '1.0.0',
    main: 'electron/main.js'
  };
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(runtimePackageJson, null, 2)
  );

  process.stdout.write(`Portable app created at ${outputDir}\n`);
  process.stdout.write(`Run: ${targetExe}\n`);
}

buildPortable().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
