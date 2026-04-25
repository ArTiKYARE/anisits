const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = 'https://api.yani.tv';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
                'Accept': 'image/avif,image/webp',
                'X-Application': 'web-viewer'
            }
        });
        res.json(response.data);
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
                'Accept': 'image/avif,image/webp',
                'X-Application': 'web-viewer'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching anime details:', error.message);
        res.status(500).json({ error: 'Failed to fetch anime details' });
    }
});

app.get('/api/anime/genres', async (req, res) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/anime/genres`, {
            headers: {
                'Accept': 'image/avif,image/webp',
                'X-Application': 'web-viewer'
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
                'Accept': 'image/avif,image/webp',
                'X-Application': 'web-viewer'
            }
        });
        res.json(response.data);
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
                'Accept': 'image/avif,image/webp',
                'X-Application': 'web-viewer'
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
