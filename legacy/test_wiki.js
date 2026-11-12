async function run() {
    const query = "Sonic The Hedgehog 2 Sega Genesis";
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json`;
    const searchRes = await (await fetch(searchUrl, { headers: { 'User-Agent': 'Germade/1.0' } })).json();
    
    if (searchRes[1] && searchRes[1].length > 0) {
        const title = searchRes[1][0];
        console.log("Found title:", title);
        
        const imgUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=500`;
        const imgRes = await (await fetch(imgUrl, { headers: { 'User-Agent': 'Germade/1.0' } })).json();
        const pages = imgRes.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pages[pageId].thumbnail) {
            console.log("Found cover:", pages[pageId].thumbnail.source);
        } else {
            console.log("No cover found for", title);
        }
    } else {
        console.log("Not found in Wikipedia");
    }
}
run();
