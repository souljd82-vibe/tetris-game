const fs = require('fs');
const archiver = require('archiver');

const output = fs.createWriteStream('tetris_deploy.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
    console.log(`✅ 배포 패키지 생성 완료: tetris_deploy.zip (${archive.pointer()} bytes)`);
});

archive.on('error', (err) => {
    throw err;
});

archive.pipe(output);

const files = [
    'server.js',
    'package.json',
    'package-lock.json',
    'Procfile',
    'index.html',
    'admin.html'
];

files.forEach(file => {
    if (fs.existsSync(file)) {
        archive.file(file, { name: file });
        console.log(`추가: ${file}`);
    }
});

archive.finalize();
