import React, { useEffect, useState, useRef } from 'react';
import Hls from 'hls.js';
import { Play, Tv, Menu, Search } from 'lucide-react';
import './App.css';

const CATEGORIES_URL = 'https://iptv-org.github.io/api/categories.json';

// --- CONFIGURATION START ---

// 1. Map your custom IDs to the files in your public folder
const CUSTOM_PLAYLISTS = {
  'premium-movies': 'playlist/premium_movie.m3u',
  // You can also override standard categories like 'news' here if you want
};

// 2. Define how they look in the sidebar
const NEW_CATEGORIES = [
  { id: 'premium-movies', name: '' },
];

// --- CONFIGURATION END ---

const App = () => {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // 1. Fetch Categories on Load
  useEffect(() => {
    fetch(CATEGORIES_URL)
      .then(res => res.json())
      .then(data => {
        // MERGE: Combine your custom categories with the official ones
        const combined = [...NEW_CATEGORIES, ...data];

        // Remove duplicates (in case an ID exists in both)
        const unique = combined.filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i);
        
        // Sort alphabetically
        const sorted = unique.sort((a, b) => a.name.localeCompare(b.name));
        
        setCategories(sorted);

        // Select 'Premium Movies' (or your first custom one) by default
        const defaultCat = sorted.find(c => c.id === NEW_CATEGORIES[0].id) || sorted[0];
        if (defaultCat) handleCategoryClick(defaultCat);
      })
      .catch(err => console.error("Failed to load categories", err));
  }, []);

  // 2. Fetch Channels when Category changes
  const handleCategoryClick = (category) => {
    setSelectedCategory(category);
    setLoading(true);
    setChannels([]);

    let playlistUrl;

    // LOGIC: Check if this is a custom playlist first
    if (CUSTOM_PLAYLISTS[category.id]) {
      console.log("Loading local playlist:", category.name);
      playlistUrl = CUSTOM_PLAYLISTS[category.id];
    } else {
      // If not custom, use the standard GitHub URL
      playlistUrl = `https://iptv-org.github.io/iptv/categories/${category.id}.m3u`;
    }

    fetch(playlistUrl)
      .then(res => {
        if (!res.ok) throw new Error("Network response was not ok");
        return res.text();
      })
      .then(text => {
        const parsedChannels = parseM3U(text);
        setChannels(parsedChannels);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading playlist", err);
        setLoading(false);
      });
  };


// 3. Robust M3U Parser
  const parseM3U = (content) => {
    const lines = content.split('\n');
    const result = [];
    let currentItem = { name: null, logo: null, url: null };

    lines.forEach(line => {
      line = line.trim();
      
      if (!line) return; // Skip empty lines

      if (line.startsWith('#EXTINF:')) {
        // 1. Extract Logo
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        if (logoMatch) currentItem.logo = logoMatch[1];

        // 2. Extract Name (everything after the last comma)
        const nameParts = line.split(',');
        currentItem.name = nameParts[nameParts.length - 1].trim() || "Unknown Channel";
      
      } else if (line.startsWith('#')) {
        // Skip comments or other headers like #EXTVLCOPT
        return; 
      
      } else {
        // It's a URL
        currentItem.url = line;
        
        // Only add if we have a valid name and URL
        if (currentItem.name && currentItem.url) {
          result.push(currentItem);
        }
        // Reset for the next channel
        currentItem = { name: null, logo: null, url: null };
      }
    });
    return result;
  };

  // 4. Play Stream (Unchanged)
  const playChannel = (channel) => {
    setCurrentChannel(channel);
    
    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(channel.url);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current.play().catch(e => console.log("Auto-play prevented", e));
      });
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = channel.url;
      videoRef.current.play();
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="logo"><Tv style={{marginBottom:-2}}/> OPEN IPTV</div>
        <div className="category-list">
          {categories.map(cat => (
            <div 
              key={cat.id} 
              className={`category-item ${selectedCategory?.id === cat.id ? 'active' : ''}`}
              onClick={() => handleCategoryClick(cat)}
            >
              {cat.name}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        
        {/* Player Section */}
        <div className="player-wrapper">
          {currentChannel ? (
            <video ref={videoRef} controls autoPlay poster={currentChannel.logo} />
          ) : (
            <div className="placeholder">
              <Tv size={48} />
              <h3>Select a channel to start watching</h3>
            </div>
          )}
        </div>

        {/* Channel Grid */}
        <div className="channel-area">
          <div className="section-title">
            {selectedCategory ? `${selectedCategory.name} Channels` : "Channels"} 
            {loading && <span style={{fontSize:'0.8rem', marginLeft:10, opacity:0.7}}> (Loading...)</span>}
            <span style={{float:'right', fontSize:'0.8rem', opacity:0.5}}>{channels.length} results</span>
          </div>

          <div className="grid">
            {channels.map((channel, idx) => (
              <div 
                key={idx} 
                className={`channel-card ${currentChannel === channel ? 'playing' : ''}`}
                onClick={() => playChannel(channel)}
              >
                {channel.logo ? (
                  <img src={channel.logo} alt={channel.name} className="channel-logo" loading="lazy" 
                       onError={(e) => e.target.style.display = 'none'}/>
                ) : (
                  <div className="channel-logo" style={{display:'flex',alignItems:'center',justifyContent:'center', color:'#555'}}>
                    <Play size={20}/>
                  </div>
                )}
                <div className="channel-name">{channel.name}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default App;