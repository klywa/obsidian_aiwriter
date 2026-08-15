import { copyFileSync, existsSync, mkdirSync } from 'fs';

const distDir = 'dist';
if (!existsSync(distDir)) {
    mkdirSync(distDir);
}

// Copy release files to dist folder
const files = ['main.js', 'manifest.json', 'styles.css', 'models.example.json'];
for (const file of files) {
    copyFileSync(file, `${distDir}/${file}`);
    console.log(`✓ Copied ${file} to ${distDir}/`);
}

console.log('\n✅ Release files ready in dist/ folder');
console.log('📦 Upload all files from dist/ to GitHub Release\n');
