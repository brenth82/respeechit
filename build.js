const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create dist directory if it doesn't exist
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
}

// Compile TypeScript files
console.log('Compiling TypeScript files...');
execSync('npx tsc', { stdio: 'inherit' });

// Copy public directory to dist
console.log('Copying public directory...');
const copyPublicDir = () => {
    const srcDir = path.join(__dirname, 'public');
    const destDir = path.join(__dirname, 'dist', 'public');
    
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    const copyRecursive = (src, dest) => {
        const exists = fs.existsSync(src);
        const stats = exists && fs.statSync(src);
        const isDirectory = exists && stats.isDirectory();

        if (isDirectory) {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest);
            }
            fs.readdirSync(src).forEach(childItemName => {
                copyRecursive(
                    path.join(src, childItemName),
                    path.join(dest, childItemName)
                );
            });
        } else {
            fs.copyFileSync(src, dest);
        }
    };

    if (fs.existsSync(srcDir)) {
        copyRecursive(srcDir, destDir);
    }
};

copyPublicDir();

console.log('Build completed successfully!');
