const execSync = require('child_process').execSync;
const fs = require('fs');

try {
  const content = execSync('git show 1ab3235:src/pages/StatementViewer.tsx', { maxBuffer: 10 * 1024 * 1024 }).toString();
  
  const logoMatch = content.match(/const LOGO_BASE64\s*=\s*"([^"]+)"/);
  const stampMatch = content.match(/const STAMP_BASE64\s*=\s*"([^"]+)"/);
  
  console.log('Logo match found:', !!logoMatch);
  console.log('Stamp match found:', !!stampMatch);
  
  if (logoMatch) {
    console.log('Logo base64 length:', logoMatch[1].length);
    fs.writeFileSync('scratch/logo_base64.txt', logoMatch[1]);
  }
  if (stampMatch) {
    console.log('Stamp base64 length:', stampMatch[1].length);
    fs.writeFileSync('scratch/stamp_base64.txt', stampMatch[1]);
  }
} catch (e) {
  console.error('Error:', e);
}
