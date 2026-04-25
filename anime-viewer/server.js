const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = 'https://ru.yummyani.me/api';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to normalize poster URLs
function normalizePosterUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) {
        return 'https:' + url;
    }
    if (!url.startsWith('http')) {
        return 'https://ru.yummyani.me' + url;
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
    // Debug logging
    console.log('Normalized posters:', normalized);
    return normalized;
}

// API Proxy endpoints
app.get('/api/anime', async (req, res) => {
    try {
        const { limit = 20, offset = 0, genre, year, status, search } = req.query;
        const params = { limit, offset };
        
        if (genre) params.genre = genre;
        if (year) params.year = year;
        if (status) params.status = status;
        if (search) params.search = search;

        const response = await axios.get(`${API_BASE_URL}/anime`, {
            params,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        // Normalize the response structure and poster URLs
        const data = response.data;
        
        // Handle both array and object responses
        if (data.response && Array.isArray(data.response)) {
            data.response = data.response.map(anime => ({
                ...anime,
                poster: normalizePosters(anime.poster)
            }));
        } else if (data.response && typeof data.response === 'object') {
            // Single anime object with lists_count etc - this is for single anime details
            // Don't modify it
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching anime:', error.message);
        res.status(500).json({ error: 'Failed to fetch anime' });
    }
});

app.get('/api/anime/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await axios.get(`${API_BASE_URL}/anime/${id}`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        // Normalize the response and add video players
        const data = response.data;
        if (data.response) {
            data.response.poster = normalizePosters(data.response.poster);
            
            // Add viewing order as videos if available
            if (data.response.viewing_order && Array.isArray(data.response.viewing_order)) {
                data.response.videos = data.response.viewing_order.map((item, index) => ({
                    iframe_url: `https://ru.yummyani.me/catalog/${item.anime_url}`,
                    title: item.title,
                    episode: index + 1,
                    data: {
                        dubbing: item.translates?.[0]?.title || 'Озвучка'
                    }
                }));
            }
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching anime details:', error.message);
        res.status(500).json({ error: 'Failed to fetch anime details' });
    }
});

app.get('/api/anime/genres', async (req, res) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/anime/genres`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching genres:', error.message);
        res.status(500).json({ error: 'Failed to fetch genres' });
    }
});

app.get('/api/anime/schedule', async (req, res) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/anime/schedule`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        // Normalize poster URLs in schedule
        const data = response.data;
        if (data.response && Array.isArray(data.response)) {
            data.response = data.response.map(anime => ({
                ...anime,
                poster: normalizePosters(anime.poster)
            }));
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching schedule:', error.message);
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});

app.get('/api/bloggers/video', async (req, res) => {
    try {
        const { limit = 10, offset = 0, category = 'all' } = req.query;
        const response = await axios.get(`${API_BASE_URL}/bloggers/video`, {
            params: { limit, offset, category },
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        res.json(response.data);
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
