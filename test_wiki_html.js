import * as cheerio from 'cheerio';

async function run() {
    const query = "Comix Zone Sega Genesis";
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=1`;
    const searchRes = await (await fetch(searchUrl, { headers: { 'User-Agent': 'Germade/1.0' } })).json();
    
    if (searchRes.query && searchRes.query.search.length > 0) {
        const title = searchRes.query.search[0].title;
        console.log("Found title:", title);
        
        const htmlUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
        const htmlRes = await fetch(htmlUrl, { headers: { 'User-Agent': 'Germade/1.0' } });
        const html = await htmlRes.text();
        
        const $ = cheerio.load(html);
        const infoboxImg = $('.infobox img').first().attr('src');
        if (infoboxImg) {
            console.log("Found cover:", "https:" + infoboxImg);
        } else {
            console.log("No cover found for", title);
        }
    } else {
        console.log("Not found in Wikipedia");
    }
}
run();
