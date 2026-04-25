const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        console.log('=== Testing Detail Page ===');
        const testId = 'avatar-legenda-ob-aange';
        
        const detailResponse = await axios.get(`https://ru.yummyani.me/catalog/item/${testId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'ru-RU,ru;q=0.9'
            }
        });
        
        console.log('Status:', detailResponse.status);
        
        const $ = cheerio.load(detailResponse.data);
        
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && content.includes('__staticRouterHydrationData')) {
                console.log('\nFound hydration script');
                
                const jsonMatch = content.match(/JSON\.parse\(\s*"([\s\S]*?)"\s*\)/);
                if (jsonMatch) {
                    let jsonString = jsonMatch[1];
                    
                    // Unescape
                    jsonString = jsonString.replace(/\\"/g, '"')
                                          .replace(/\\\\/g, '\\')
                                          .replace(/\\n/g, '\n')
                                          .replace(/\\t/g, '\t')
                                          .replace(/\\r/g, '\r')
                                          .replace(/\\b/g, '\b')
                                          .replace(/\\f/g, '\f')
                                          .replace(/\\u([0-9a-fA-F]{4})/g, (m, p1) => String.fromCharCode(parseInt(p1, 16)))
                                          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
                    
                    try {
                        const data = JSON.parse(jsonString);
                        
                        if (data.loaderData) {
                            for (const key of Object.keys(data.loaderData)) {
                                const value = data.loaderData[key];
                                if (value && value.anime) {
                                    const anime = value.anime;
                                    console.log('\n=== Anime Data ===');
                                    console.log('Title:', anime.title);
                                    console.log('Desc type:', typeof anime.description);
                                    if (anime.description && typeof anime.description === 'object') {
                                        console.log('Desc keys:', Object.keys(anime.description));
                                        console.log('Desc big type:', typeof anime.description.big);
                                        console.log('Desc big (first 100):', String(anime.description.big).substring(0, 100));
                                    }
                                    console.log('Poster:', anime.poster);
                                    console.log('Genres:', Array.isArray(anime.genres) ? anime.genres.length : 0, 'items');
                                    console.log('Year:', anime.year);
                                    console.log('Status:', anime.status);
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Parse error:', e.message);
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();
