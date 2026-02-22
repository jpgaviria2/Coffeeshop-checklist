const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Create gradient background (purple gradient #667eea to #764ba2)
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Add coffee cup emoji (using text rendering)
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size * 0.6}px Arial`;
  ctx.fillText('☕', size / 2, size / 2);

  // Save as PNG
  const buffer = canvas.toBuffer('image/png');
  const filename = `icon-${size}x${size}.png`;
  fs.writeFileSync(path.join(__dirname, filename), buffer);
  console.log(`Generated ${filename}`);
}

// Generate both required sizes
generateIcon(192);
generateIcon(512);

console.log('Icon generation complete!');
