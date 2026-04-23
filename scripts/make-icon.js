const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

async function run() {
  const rootDir = path.resolve(__dirname, '..');
  const sourcePng = path.join(rootDir, 'icons', 'icon-512.png');
  const buildDir = path.join(rootDir, 'build');
  const outputIco = path.join(buildDir, 'icon.ico');
  const outputPng = path.join(buildDir, 'icon.png');

  if (!fs.existsSync(sourcePng)) {
    throw new Error(`Missing icon source: ${sourcePng}`);
  }

  fs.mkdirSync(buildDir, { recursive: true });
  const icoBuffer = await pngToIco(sourcePng);
  fs.writeFileSync(outputIco, icoBuffer);
  fs.copyFileSync(sourcePng, outputPng);

  process.stdout.write(`Generated ${outputIco}\n`);
}

run().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
