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
    // Look for var __ssr_data={...} pattern in the HTML
    const match = html.match(/var\s+__ssr_data\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
    
    if (!match) {
        return null;
    }
    
    let jsonString = match[1];
    
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error('Failed to parse SSR data:', e.message);
        // Try to fix common JSON issues
        try {
            // Remove trailing commas before closing brackets
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

// Parse anime list from catalog page
async function parseAnimeList(page = 1) {
    try {
        const response = await axios.get(`${BASE_URL}/catalog`, {
            params: { page },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const animeList = [];
        
        $('.catalog-item, .anime-item, [class*="anime"], [class*="card"]').each((i, el) => {
            const $el = $(el);
            const title = $el.find('.title, [class*="title"]').first().text().trim();
            const link = $el.find('a').first().attr('href');
            const image = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src');
            
            if (title && link) {
                animeList.push({
                    id: link.split('/').pop(),
                    title: title,
                    url: link,
                    poster: {
                        small: normalizePosterUrl(image),
                        medium: normalizePosterUrl(image),
                        big: normalizePosterUrl(image)
                    }
                });
            }
        });
        
        // If no items found with class selectors, try extracting from SSR data
        if (animeList.length === 0) {
            const ssrData = extractSsrData(response.data);
            if (ssrData && ssrData.props && ssrData.props.pageProps) {
                const pageProps = ssrData.props.pageProps;
                const items = pageProps.anime || pageProps.catalog || pageProps.items || [];
                
                items.forEach(item => {
                    animeList.push({
                        id: item.id || item.url?.split('/').pop(),
                        title: item.title || item.name,
                        url: item.url || `/catalog/${item.id}`,
                        poster: normalizePosters(item.poster || item.image)
                    });
                });
            }
        }
        
        return { response: animeList, total: animeList.length };
    } catch (error) {
        console.error('Error parsing anime list:', error.message);
        throw error;
    }
}

// Parse anime details from individual page
async function parseAnimeDetails(id) {
    try {
        const response = await axios.get(`${BASE_URL}/catalog/${id}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        // Try to extract from SSR data first
        const ssrData = extractSsrData(response.data);
        let anime = {};
        
        if (ssrData && ssrData.props && ssrData.props.pageProps) {
            const pageProps = ssrData.props.pageProps;
            anime = pageProps.anime || pageProps.item || {};
        }
        
        // Fallback to HTML parsing if SSR data not available
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
        }
        
        // Extract video players/episodes
        const videos = [];
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
        
        if (videos.length > 0) {
            anime.videos = videos;
        }
        
        // Normalize poster
        if (anime.poster) {
            anime.poster = normalizePosters(anime.poster);
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
        
        // Use web scraping to get anime list
        const data = await parseAnimeList(parseInt(page));
        
        // Apply limit and offset if needed
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
        
        // Use web scraping to get anime details
        const data = await parseAnimeDetails(id);
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching anime details:', error.message);
        res.status(500).json({ error: 'Failed to fetch anime details' });
    }
});

app.get('/api/anime/genres', async (req, res) => {
    try {
        // Parse genres from catalog page
        const response = await axios.get(`${BASE_URL}/catalog`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const genres = [];
        
        // Try to extract genres from filter/sidebar
        $('[class*="genre"], [class*="filter"] a').each((i, el) => {
            const name = $(el).text().trim();
            const href = $(el).attr('href');
            if (name && href) {
                genres.push({ id: i, name, url: href });
            }
        });
        
        // If no genres found, try SSR data
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
        // Try to get schedule from main page or dedicated schedule page
        const response = await axios.get(`${BASE_URL}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const schedule = [];
        
        // Look for schedule section
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
        
        // If no schedule found, try SSR data
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
        // Parse blogger videos from site
        const response = await axios.get(`${BASE_URL}/bloggers`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const videos = [];
        
        // Try to extract video items
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
        
        // If no videos found, try SSR data
        if (videos.length === 0) {
            const ssrData = extractSsrData(response.data);
            if (ssrData && ssrData.props && ssrData.props.pageProps) {
                const pageProps = ssrData.props.pageProps;
                const videoList = pageProps.videos || pageProps.bloggers || [];
                videoList.forEach((item, i) => {
                    videos.push({
                        id: item.id || i,
                        title: item.title || item.name,
                        thumbnail: normalizePosterUrl(item.thumbnail || item.image)
                    });
                });
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
