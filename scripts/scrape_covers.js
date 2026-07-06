import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROMS_DIR = path.join(__dirname, '../public/roms/megadrive');
const COVERS_DIR = path.join(ROMS_DIR, 'covers');
const ROMS_JSON = path.join(__dirname, '../public/roms/roms.megadrive.json');

if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
}

async function scrapeWikiCover(title) {
    const query = `${title} Sega Genesis`;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=1`;
    
    try {
        const searchRes = await (await fetch(searchUrl, { headers: { 'User-Agent': 'Germade/1.0' } })).json();
        if (searchRes.query && searchRes.query.search.length > 0) {
            const wikiTitle = searchRes.query.search[0].title;
            const htmlUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, '_'))}`;
            
            const htmlRes = await fetch(htmlUrl, { headers: { 'User-Agent': 'Germade/1.0' } });
            const html = await htmlRes.text();
            
            const $ = cheerio.load(html);
            const infoboxImg = $('.infobox img').first().attr('src');
            
            if (infoboxImg) {
                // Return a larger image if possible (Wikipedia thumbs are usually 220px or 250px)
                let imgUrl = "https:" + infoboxImg;
                imgUrl = imgUrl.replace(/\/\d+px-/, '/500px-'); // Request 500px version
                return imgUrl;
            }
        }
    } catch (e) {
        console.error(`Error scraping ${title}:`, e.message);
    }
    return null;
}

async function downloadImage(url, destPath) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Germade/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
}

async function run() {
    if (!fs.existsSync(ROMS_JSON)) {
        console.error("ROMs JSON not found at", ROMS_JSON);
        return;
    }
    
    const roms = JSON.parse(fs.readFileSync(ROMS_JSON, 'utf8'));
    
    for (let rom of roms) {
        if (!rom.cover) {
            console.log(`Fetching cover for: ${rom.title}`);
            const coverUrl = await scrapeWikiCover(rom.title);
            
            if (coverUrl) {
                const ext = path.extname(new URL(coverUrl).pathname) || '.jpg';
                // Filename safe
                const safeTitle = rom.title.replace(/[^a-zA-Z0-9]/g, '_');
                const coverFilename = `${safeTitle}${ext}`;
                const destPath = path.join(COVERS_DIR, coverFilename);
                
                try {
                    await downloadImage(coverUrl, destPath);
                    rom.cover = `/roms/megadrive/covers/${coverFilename}`;
                    console.log(`Saved cover to ${rom.cover}`);
                } catch (e) {
                    console.error(`Failed to download ${coverUrl}:`, e.message);
                }
            } else {
                console.log(`No cover found for ${rom.title}`);
            }
        } else {
            console.log(`Cover already exists for ${rom.title}`);
        }
    }
    
    fs.writeFileSync(ROMS_JSON, JSON.stringify(roms, null, 2));
    console.log("Updated roms.megadrive.json");
}

run();
