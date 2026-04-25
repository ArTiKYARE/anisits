const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://ru.yummyani.me';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to extract JSON data from __ssr_data script tag
function extractSsrData(html) {
    // Look for __ssr_data={...} pattern
    const match = html.match(/__ssr_data\s*=\s*(\{[\s\S]*?)(?=\)\s*;?\s*<\/script>|<\/script>)/);

    if (!match) {
        return null;
    }

    let jsonString = match[1].trim();
    
    // Remove trailing ); if present
    jsonString = jsonString.replace(/\)\s*$/, '');

    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error('Failed to parse SSR data:', e.message);
        try {
            const cleaned = jsonString.replace(/,\s*([}\]])/g, '$1');
            return JSON.parse(cleaned);
        } catch (e2) {
            console.error('Failed to parse cleaned SSR data:', e2.message);
            return null;
        }
    }
}

// Helper function to normalize poster URLs
function normalizePosterUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) {
        return 'https:' + url;
    }
    if (!url.startsWith('http')) {
        return BASE_URL + url;
    }
    return url;
}

// Helper function to normalize all poster sizes in an object
function normalizePosters(posterObj) {
    if (!posterObj) return {};
    const normalized = {
        fullsize: normalizePosterUrl(posterObj.fullsize),
        big: normalizePosterUrl(posterObj.big),
        small: normalizePosterUrl(posterObj.small),
        medium: normalizePosterUrl(posterObj.medium),
        huge: normalizePosterUrl(posterObj.huge),
        mega: normalizePosterUrl(posterObj.mega)
    };
    return normalized;
}

// Parse anime list from catalog page using HTML scraping
async function parseAnimeList(page = 1) {
    try {
        const response = await axios.get(`${BASE_URL}/catalog`, {
            params: { page },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const $ = cheerio.load(response.data);
        const animeList = [];

        // Extract anime items from href links with catalog/item pattern
        $('a[href^="/catalog/item"]').each((i, el) => {
            const href = $(el).attr('href');
            if (href && !animeList.find(a => a.url === href)) {
                const id = href.split('/').pop();
                const title = $(el).find('.title, [class*="title"], img[alt]').first().attr('alt') || 
                              $(el).text().trim() || id;
                const image = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');
                
                if (id && id !== 'item') {
                    animeList.push({
                        id: id,
                        title: title.replace(/^[^\w]/, '').trim() || id,
                        url: href,
                        poster: {
                            small: normalizePosterUrl(image),
                            medium: normalizePosterUrl(image),
                            big: normalizePosterUrl(image)
                        }
                    });
                }
            }
        });

        // If no items found with link selectors, try extracting from SSR data
        if (animeList.length === 0) {
            const ssrData = extractSsrData(response.data);
            if (ssrData) {
                // Look for catalog data in SSR keys
                for (const key of Object.keys(ssrData)) {
                    if (key.includes('catalog') && Array.isArray(ssrData[key])) {
                        const items = ssrData[key];
                        // Handle nested structure like {response: [...], limit: 24}
                        const actualItems = items[0]?.response || items[0]?.items || items;
                        
                        if (Array.isArray(actualItems)) {
                            actualItems.forEach(item => {
                                if (item.title || item.name) {
                                    animeList.push({
                                        id: item.anime_url || item.id || item.url?.split('/').pop(),
                                        title: item.title || item.name,
                                        url: item.url || `/catalog/${item.anime_url || item.id}`,
                                        poster: normalizePosters(item.poster || item.image)
                                    });
                                }
                            });
                            break;
                        }
                    }
                }
            }
        }

        // Remove duplicates
        const seen = new Set();
        const uniqueList = animeList.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        return { response: uniqueList, total: uniqueList.length };
    } catch (error) {
        console.error('Error parsing anime list:', error.message);
        throw error;
    }
}

// Parse anime details from individual page
async function parseAnimeDetails(id) {
    try {
        const response = await axios.get(`${BASE_URL}/catalog/item/${id}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const $ = cheerio.load(response.data);

        // Try to extract from __staticRouterHydrationData first
        let anime = {};
        
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && content.includes('__staticRouterHydrationData') && !anime.title) {
                const jsonMatch = content.match(/JSON\.parse\(\s*"([\s\S]*?)"\s*\)/);
                if (jsonMatch) {
                    let jsonString = jsonMatch[1];
                    
                    // Unescape JSON string
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
                                    anime = value.anime;
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing hydration data:', e.message);
                    }
                }
            }
        });

        // Fallback to HTML parsing if no data from hydration
        if (!anime.title) {
            anime.title = $('h1').first().text().trim();
            anime.description = $('.description, [class*="desc"], [class*="about"]').first().text().trim();
            anime.year = parseInt($('[class*="year"]').first().text()) || null;
            anime.status = $('[class*="status"]').first().text().trim();

            const genres = [];
            $('[class*="genre"]').each((i, el) => {
                const genre = $(el).text().trim();
                if (genre) genres.push({ name: genre });
            });
            anime.genres = genres;

            const image = $('img').filter((i, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src');
                return src && (src.includes('poster') || src.includes('anime'));
            }).first().attr('src') || $('img').first().attr('src');

            anime.poster = {
                small: normalizePosterUrl(image),
                medium: normalizePosterUrl(image),
                big: normalizePosterUrl(image),
                fullsize: normalizePosterUrl(image)
            };
        } else {
            // Normalize poster if it's an object
            if (anime.poster && typeof anime.poster === 'object') {
                anime.poster = normalizePosters(anime.poster);
            }
            
            // Normalize genres
            if (Array.isArray(anime.genres)) {
                anime.genres = anime.genres.map(g => ({
                    id: g.id,
                    name: g.name || g.title
                }));
            }
        }

        // Extract video players/episodes
        const videos = [];
        
        // Check for videos in parsed data
        if (anime.videos && Array.isArray(anime.videos)) {
            anime.videos.forEach((v, i) => {
                videos.push({
                    iframe_url: v.iframe_url || v.url,
                    episode: v.episode || i + 1,
                    title: v.title || `Серия ${i + 1}`
                });
            });
        }
        
        // Also check for iframes in HTML
        if (videos.length === 0) {
            const playerFrames = $('iframe[src*="player"], iframe[src*="video"], [class*="player"] iframe');
            playerFrames.each((i, el) => {
                const src = $(el).attr('src');
                if (src) {
                    videos.push({
                        iframe_url: src,
                        episode: i + 1,
                        title: `Серия ${i + 1}`
                    });
                }
            });
        }

        if (videos.length > 0) {
            anime.videos = videos;
        }

        return { response: anime };
    } catch (error) {
        console.error('Error parsing anime details:', error.message);
        throw error;
    }
}

// API Proxy endpoints - Web Scraping implementation
app.get('/api/anime', async (req, res) => {
    try {
        const { limit = 20, offset = 0, page = 1 } = req.query;

        const data = await parseAnimeList(parseInt(page));

        let response = data.response;
        if (offset > 0) {
            response = response.slice(offset);
        }
        if (limit && response.length > limit) {
            response = response.slice(0, limit);
        }

        res.json({ response, total: data.total });
    } catch (error) {
        console.error('Error fetching anime:', error.message);
        res.status(500).json({ error: 'Failed to fetch anime' });
    }
});

app.get('/api/anime/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await parseAnimeDetails(id);
        res.json(data);
    } catch (error) {
        console.error('Error fetching anime details:', error.message);
        res.status(500).json({ error: 'Failed to fetch anime details' });
    }
});

app.get('/api/anime/genres', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/catalog`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const genres = [];

        $('[class*="genre"], [class*="filter"] a').each((i, el) => {
            const name = $(el).text().trim();
            const href = $(el).attr('href');
            if (name && href) {
                genres.push({ id: i, name, url: href });
            }
        });

        if (genres.length === 0) {
            const ssrData = extractSsrData(response.data);
            if (ssrData && ssrData.props && ssrData.props.pageProps) {
                const pageProps = ssrData.props.pageProps;
                const genreList = pageProps.genres || pageProps.filters?.genres || [];
                genreList.forEach((g, i) => {
                    genres.push({ id: g.id || i, name: g.name || g.title, url: g.url });
                });
            }
        }

        res.json({ response: genres });
    } catch (error) {
        console.error('Error fetching genres:', error.message);
        res.status(500).json({ error: 'Failed to fetch genres' });
    }
});

app.get('/api/anime/schedule', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const schedule = [];

        $('[class*="schedule"], [class*="release"]').each((i, el) => {
            const $el = $(el);
            const title = $el.find('.title, [class*="title"]').first().text().trim();
            const time = $el.find('[class*="time"], [class*="date"]').first().text().trim();

            if (title) {
                schedule.push({
                    id: i,
                    title,
                    release_time: time
                });
            }
        });

        if (schedule.length === 0) {
            const ssrData = extractSsrData(response.data);
            if (ssrData && ssrData.props && ssrData.props.pageProps) {
                const pageProps = ssrData.props.pageProps;
                const scheduleData = pageProps.schedule || pageProps.releases || [];
                scheduleData.forEach((item, i) => {
                    schedule.push({
                        id: item.id || i,
                        title: item.title || item.name,
                        release_time: item.release_time || item.time
                    });
                });
            }
        }

        res.json({ response: schedule });
    } catch (error) {
        console.error('Error fetching schedule:', error.message);
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});

app.get('/api/bloggers/video', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/bloggers`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const videos = [];

        $('[class*="video"], [class*="blogger"]').each((i, el) => {
            const $el = $(el);
            const title = $el.find('.title, [class*="title"]').first().text().trim();
            const thumbnail = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src');

            if (title) {
                videos.push({
                    id: i,
                    title,
                    thumbnail: normalizePosterUrl(thumbnail)
                });
            }
        });

        if (videos.length === 0) {
            const ssrData = extractSsrData(response.data);
            if (ssrData) {
                for (const key of Object.keys(ssrData)) {
                    if (key.includes('bloggers') || key.includes('video')) {
                        const videoList = ssrData[key];
                        if (Array.isArray(videoList)) {
                            videoList.forEach((item, i) => {
                                videos.push({
                                    id: item.id || i,
                                    title: item.title || item.name,
                                    thumbnail: normalizePosterUrl(item.thumbnail || item.image || item.previews?.small)
                                });
                            });
                            break;
                        }
                    }
                }
            }
        }

        res.json({ response: videos });
    } catch (error) {
        console.error('Error fetching blogger videos:', error.message);
        res.status(500).json({ error: 'Failed to fetch blogger videos' });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
