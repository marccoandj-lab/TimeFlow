const sharp = require('sharp');

const svg192 = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="192" height="192" rx="38" fill="url(#grad)"/>
  <circle cx="96" cy="96" r="50" fill="none" stroke="white" stroke-width="6"/>
  <circle cx="96" cy="96" r="10" fill="white"/>
  <line x1="96" y1="96" x2="96" y2="60" stroke="white" stroke-width="6" stroke-linecap="round"/>
  <line x1="96" y1="96" x2="130" y2="96" stroke="white" stroke-width="6" stroke-linecap="round"/>
</svg>`;

const svg512 = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="102" fill="url(#grad)"/>
  <circle cx="256" cy="256" r="135" fill="none" stroke="white" stroke-width="16"/>
  <circle cx="256" cy="256" r="26" fill="white"/>
  <line x1="256" y1="256" x2="256" y2="160" stroke="white" stroke-width="16" stroke-linecap="round"/>
  <line x1="256" y1="256" x2="350" y2="256" stroke="white" stroke-width="16" stroke-linecap="round"/>
</svg>`;

async function generateIcons() {
  await sharp(Buffer.from(svg192))
    .png()
    .toFile('public/icon-192x192.png');
  console.log('Created icon-192x192.png');

  await sharp(Buffer.from(svg512))
    .png()
    .toFile('public/icon-512x512.png');
  console.log('Created icon-512x512.png');
}

generateIcons().catch(console.error);