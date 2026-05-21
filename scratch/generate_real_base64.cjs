const fs = require('fs');
const path = require('path');

try {
  const logoPath = path.join(__dirname, '../public/logo.png');
  const stampPath = path.join(__dirname, '../public/stamp.png');
  
  const assetsDir = path.join(__dirname, '../src/assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  
  if (fs.existsSync(logoPath)) {
    const logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
    const logoTs = `export const LOGO_BASE64 = "${logoBase64}";\n`;
    fs.writeFileSync(path.join(assetsDir, 'logoBase64.ts'), logoTs);
    console.log('logoBase64.ts written successfully. Length:', logoBase64.length);
  } else {
    console.error('logo.png not found at:', logoPath);
  }
  
  if (fs.existsSync(stampPath)) {
    const stampBase64 = 'data:image/png;base64,' + fs.readFileSync(stampPath).toString('base64');
    const stampTs = `export const STAMP_BASE64 = "${stampBase64}";\n`;
    fs.writeFileSync(path.join(assetsDir, 'stampBase64.ts'), stampTs);
    console.log('stampBase64.ts written successfully. Length:', stampBase64.length);
  } else {
    console.error('stamp.png not found at:', stampPath);
  }
} catch (e) {
  console.error('Error generating assets:', e);
}
