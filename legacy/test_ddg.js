import * as cheerio from 'cheerio';

async function run() {
    const query = "Sonic The Hedgehog 2 Sega Genesis game cover image";
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // DuckDuckGo html image results sometimes have class .result__image__img
    // Wait, DuckDuckGo HTML doesn't do image search natively in the same way. It returns web results.
    // Web results have icons.
    
    // Let's try searching rawg API directly without key? Rawg requires an API key, but we can try scraping it? No.
    // What if we search thegamesdb.net?
    console.log("Done");
}
run();
