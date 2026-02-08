const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

let spotifyTokenCache = {
    token: null,
    expiresAt: 0
};

async function getSpotifyToken() {
    if (spotifyTokenCache.token && Date.now() < spotifyTokenCache.expiresAt) {
        return spotifyTokenCache.token;
    }

    const clientId = process.env.SPOTIFY_ID;
    const clientSecret = process.env.SPOTIFY_SECRET;

    if (!clientId || !clientSecret) return null;

    try {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) return null;
        const data = await response.json();
        
        spotifyTokenCache.token = data.access_token;
        spotifyTokenCache.expiresAt = Date.now() + ((data.expires_in - 300) * 1000);
        
        return data.access_token;
    } catch (err) {
        return null;
    }
}

async function getArtistImage(artistName) {
    try {
        const token = await getSpotifyToken();
        if (!token) return null;

        const url = `https://api.spotify.com/v1/search?q=artist:${encodeURIComponent(artistName)}&type=artist&limit=1`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) return null;
        const data = await res.json();
        
        // Return the first (highest res) image
        return data.artists?.items?.[0]?.images?.[0]?.url || null;
    } catch (err) {
        return null;
    }
}

async function getTrackImage(trackName, artistName) {
    try {
        const token = await getSpotifyToken();
        if (!token) return null;

        const url = `https://api.spotify.com/v1/search?q=track:${encodeURIComponent(trackName)} artist:${encodeURIComponent(artistName)}&type=track&limit=1`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) return null;
        const data = await res.json();
        
        return data.tracks?.items?.[0]?.album?.images?.[0]?.url || null;
    } catch (err) {
        return null;
    }
}

async function getAlbumImage(albumName, artistName) {
    try {
        const token = await getSpotifyToken();
        if (!token) return null;

        const url = `https://api.spotify.com/v1/search?q=album:${encodeURIComponent(albumName)} artist:${encodeURIComponent(artistName)}&type=album&limit=1`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) return null;
        const data = await res.json();
        
        return data.albums?.items?.[0]?.images?.[0]?.url || null;
    } catch (err) {
        return null;
    }
}

async function getTrackData(trackId) {
    try {
        const token = await getSpotifyToken();
        if (!token) return null;

        const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        return null;
    }
}

async function getAlbumTracks(albumId) {
    try {
        const token = await getSpotifyToken();
        if (!token) return null;

        const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) return null;
        const albumData = await res.json();
        
        return {
            name: albumData.name,
            artist: albumData.artists[0]?.name,
            tracks: albumData.tracks.items.map(track => ({
                id: track.id,
                name: track.name,
                artists: track.artists.map(a => a.name),
                duration_ms: track.duration_ms,
                album: { 
                    name: albumData.name,
                    images: albumData.images, // Pass the album images down
                    release_date: albumData.release_date
                }
            }))
        };
    } catch (err) {
        return null;
    }
}

async function getPlaylistTracks(playlistId) {
    try {
        const token = await getSpotifyToken();
        if (!token) return null;

        const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) return null;
        const playlistData = await res.json();
        
        return {
            name: playlistData.name,
            owner: playlistData.owner?.display_name,
            tracks: playlistData.tracks.items.map(item => ({
                id: item.track.id,
                name: item.track.name,
                artists: item.track.artists.map(a => a.name),
                duration_ms: item.track.duration_ms,
                album: item.track.album // Playlist items already have album info
            }))
        };
    } catch (err) {
        return null;
    }
}

module.exports = {
    getArtistImage,
    getTrackImage,
    getAlbumImage,
    getTrackData,
    getAlbumTracks,
    getPlaylistTracks
};
