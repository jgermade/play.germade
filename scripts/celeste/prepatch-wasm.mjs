import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../../');
const PUBLIC_DIR = path.join(ROOT, 'public');
const TMP_OPFS_DIR = path.join(ROOT, '.tmp/patched-opfs');

const mimeTypes = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg', '.svg': 'image/svg+xml',
    '.webp': 'image/webp', '.wasm': 'application/wasm', '.zip': 'application/zip'
};

const prepatchHtml = `
<!DOCTYPE html>
<html><body>
<script type="module">
    import { Unzip, UnzipInflate, UnzipPassThrough } from "https://unpkg.com/fflate?module";
    
    async function run() {
        const res = await fetch("/game/celeste/assets.zip");
        const reader = res.body.getReader();
        const root = await navigator.storage.getDirectory();
        
        const unzipper = new Unzip();
        unzipper.register(UnzipInflate);
        unzipper.register(UnzipPassThrough);
        
        let activeWrites = 0;
        let ended = false;
        
        const checkDone = async () => {
            if (ended && activeWrites === 0) {
                await root.getFileHandle(".ContentExists", { create: true });
                window.location.href = "/game/celeste/build/index.html";
            }
        };
        
        unzipper.onEnd = () => { ended = true; checkDone(); };
        
        const writeQueue = [];
        let isWriting = false;
        
        async function processWriteQueue() {
            if (isWriting) return;
            isWriting = true;
            while(writeQueue.length > 0) {
                const task = writeQueue.shift();
                await task();
            }
            isWriting = false;
        }
        
        const dirCache = { "": root };
        async function getCachedDir(pathParts) {
            let current = root;
            let currentPath = "";
            for (const part of pathParts) {
                if (!part) continue;
                currentPath += (currentPath ? "/" : "") + part;
                if (!dirCache[currentPath]) {
                    dirCache[currentPath] = await current.getDirectoryHandle(part, { create: true });
                }
                current = dirCache[currentPath];
            }
            return current;
        }
        
        unzipper.onfile = (file) => {
            if (file.name.endsWith("/")) {
                file.ondata = () => {}; file.start(); return;
            }
            let fileData = [];
            file.ondata = (err, data, final) => {
                if (data) fileData.push(new Uint8Array(data));
                if (final) {
                    activeWrites++;
                    writeQueue.push(async () => {
                        try {
                            const pathParts = file.name.split("/");
                            const name = pathParts.pop();
                            const dirHandle = await getCachedDir(pathParts);
                            const fh = await dirHandle.getFileHandle(name, { create: true });
                            const writable = await fh.createWritable();
                            await writable.write(new Blob(fileData));
                            await writable.close();
                        } catch(e) {}
                        activeWrites--;
                        checkDone();
                    });
                    processWriteQueue();
                }
            };
            file.start();
        };
        
        while(true) {
            while(writeQueue.length > 20) {
                await new Promise(r => setTimeout(r, 10));
            }
            const {done, value} = await reader.read();
            if (done) { unzipper.push(new Uint8Array(0), true); ended = true; checkDone(); break; }
            unzipper.push(value);
        }
    }
    run();
</script>
</body></html>
`;

// Cleanup old patched OPFS if exists
if (fs.existsSync(TMP_OPFS_DIR)) {
    fs.rmSync(TMP_OPFS_DIR, { recursive: true, force: true });
}


const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/upload')) {
        const urlParams = new URL(req.url, `http://${req.headers.host}`);
        const filepath = urlParams.searchParams.get('path');
        const dest = path.join(TMP_OPFS_DIR, filepath);

        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const writeStream = fs.createWriteStream(dest);
        req.pipe(writeStream);
        req.on('end', () => {
            res.writeHead(200);
            res.end('OK');
        });
        return;
    }

    let reqPath = req.url.split('?')[0];
    if (reqPath === '/prepatch.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(prepatchHtml);
        return;
    }
    if (reqPath.endsWith('/')) reqPath += 'index.html';
    const filePath = path.join(PUBLIC_DIR, reqPath);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(0, async () => {
    const port = server.address().port;
    console.log(`Server listening on port ${port}`);

    const withEverest = process.argv.includes('--everest');
    const isVisible = process.argv.includes('--visible');

    console.log('Launching browser...');
    const userDataDir = path.join(ROOT, '.tmp', 'playwright-profile');
    if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: !isVisible,
        args: ['--unlimited-storage']
    });
    const page = await context.newPage();

    page.on('console', msg => console.log(`BROWSER: ${msg.text()}`));
    page.on('pageerror', err => console.error(`PAGE ERROR: ${err.message}`));
    page.on('requestfailed', req => console.error(`REQ FAILED: ${req.url()} - ${req.failure()?.errorText}`));

    console.log('Navigating to prepatch.html...');
    await page.goto(`http://localhost:${port}/prepatch.html`);

    let success = false;
    try {
        console.log('Waiting for Patch Celeste button (this may take a few minutes while OPFS extracts)...');
        await page.waitForSelector('button:has-text("Patch Celeste")', { timeout: 0 });

        if (withEverest) {
            console.log('Checking Everest switch...');
            await page.evaluate(() => {
                const everestSwitch = document.querySelector('input[type="checkbox"]');
                if (everestSwitch && !everestSwitch.checked) {
                    everestSwitch.click();
                }
            });
        }

        console.log('Clicking Patch Celeste...');
        await page.click('button:has-text("Patch Celeste")');

        console.log('Waiting for patching to finish...');

        await page.waitForSelector('button:has-text("Play"), canvas', { timeout: 300000 });
        // await page.waitForSelector('text="Game not running."', { timeout: 300000 });

        console.log('Patching finished! Extracting OPFS...');
        await page.evaluate(async (port) => {
            const root = await navigator.storage.getDirectory();
            async function sendDir(dirHandle, pathStr = "") {
                for await (const entry of dirHandle.values()) {
                    if (entry.kind === "file") {
                        const file = await entry.getFile();
                        await fetch(`http://localhost:${port}/upload?path=${encodeURIComponent(pathStr + entry.name)}`, {
                            method: "POST",
                            body: file
                        });
                    } else if (entry.kind === "directory") {
                        await sendDir(entry, pathStr + entry.name + "/");
                    }
                }
            }
            await sendDir(root);
        }, port);

        console.log('OPFS extraction complete.');
        success = true;
    } catch (e) {
        console.error('Error during prepatch:', e);
        try {
            await page.screenshot({ path: path.join(ROOT, 'error-screenshot.png') });
            console.log('Saved error screenshot to error-screenshot.png');
        } catch (se) { }
    } finally {
        await context.close();
        process.exit(success ? 0 : 1);
    }
});
