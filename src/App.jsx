import React, { useEffect, useState, useRef } from 'react';
import Hls from 'hls.js';
import { Play, Tv, Menu, X } from 'lucide-react'; // Added 'X' icon
import './App.css';

const CATEGORIES_URL = 'https://iptv-org.github.io/api/categories.json';

// --- CONFIGURATION ---
const CUSTOM_PLAYLISTS = {
  'premium-movies': '/playlist/premium_movie.m3u',
};

const NEW_CATEGORIES = [
  { id: 'premium-movies', name: 'Premium Movies' },
];
// --- END CONFIGURATION ---

const App = () => {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // NEW: Sidebar State
  
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => {
    fetch(CATEGORIES_URL)
      .then(res => res.json())
      .then(data => {
        const combined = [...NEW_CATEGORIES, ...data];
        const unique = combined.filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i);
        const sorted = unique.sort((a, b) => a.name.localeCompare(b.name));
        setCategories(sorted);
        const defaultCat = sorted.find(c => c.id === NEW_CATEGORIES[0].id) || sorted[0];
        if (defaultCat) handleCategoryClick(defaultCat);
      })
      .catch(err => console.error("Failed to load categories", err));
  }, []);

  const handleCategoryClick = (category) => {
    setSelectedCategory(category);
    setIsSidebarOpen(false); // NEW: Close sidebar on mobile when clicked
    setLoading(true);
    setChannels([]);

    let playlistUrl;
    if (CUSTOM_PLAYLISTS[category.id]) {
      playlistUrl = CUSTOM_PLAYLISTS[category.id];
    } else {
      playlistUrl = `https://iptv-org.github.io/iptv/categories/${category.id}.m3u`;
    }

    fetch(playlistUrl)
      .then(res => { if (!res.ok) throw new Error("Net"); return res.text(); })
      .then(text => {
        const parsedChannels = parseM3U(text);
        setChannels(parsedChannels);
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoading(false); });
  };

  const parseM3U = (content) => {
    const lines = content.split('\n');
    const result = [];
    let currentItem = { name: null, logo: null, url: null };

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      if (line.startsWith('#EXTINF:')) {
        // Extract Logo
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        if (logoMatch) currentItem.logo = logoMatch[1];
        
        // Extract Name (Everything after the last comma)
        const nameParts = line.split(',');
        currentItem.name = nameParts[nameParts.length - 1].trim();
      
      } else if (line.startsWith('#')) {
        // Ignore other headers like #EXTM3U or #EXTVLCOPT
        return;
      
      } else {
        // This is the URL line
        currentItem.url = line;
        
        // Check for UDP (Browsers CANNOT play these)
        if (line.includes('udp://')) {
           console.warn('Skipping UDP stream (browser unsupported):', currentItem.name);
        } else if (currentItem.name && currentItem.url) {
           result.push(currentItem);
        }
        
        // Reset
        currentItem = { name: null, logo: null, url: null };
      }
    });
    return result;
  };

  const playChannel = (channel) => {
    setCurrentChannel(channel);
    setIsVideoLoading(true);
    
    if (hlsRef.current) hlsRef.current.destroy();

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(channel.url);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
         videoRef.current?.play().catch(e => console.log(e));
      });
      hls.on(Hls.Events.ERROR, (e, data) => {
         if (data.fatal) hls.destroy();
      });
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = channel.url;
      videoRef.current.play();
    }
  };

  return (
    <div className="app-container">
      {/* Mobile Overlay (Dark background when menu is open) */}
      {isSidebarOpen && <div className="overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* Sidebar */}
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="logo">
          <Tv style={{marginBottom:-2}}/> OPEN IPTV
          {/* Close button for mobile */}
          <X className="close-btn" size={24} style={{marginLeft:'auto', cursor:'pointer'}} onClick={() => setIsSidebarOpen(false)}/> 
        </div>
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
        
        {/* NEW: Mobile Header */}
        <div className="mobile-header">
           <div style={{fontWeight:'bold', display:'flex', alignItems:'center', gap:10}}>
             <Tv color="#e50914"/> OPEN IPTV
           </div>
           <button onClick={() => setIsSidebarOpen(true)} style={{background:'none', border:'none', color:'white'}}>
             <Menu size={28}/>
           </button>
        </div>

        {/* Player */}
        <div className="player-wrapper">
          {isVideoLoading && <div style={{position:'absolute', zIndex:10}}><div className="loader"></div></div>}
          
          {currentChannel ? (
            <video 
              ref={videoRef} 
              controls 
              autoPlay 
              poster={currentChannel.logo}
              onPlaying={() => setIsVideoLoading(false)}
              onWaiting={() => setIsVideoLoading(true)}
              playsInline 
            />
          ) : (
            <div className="placeholder">
              <Tv size={48} />
              <h3>Tap a channel to play</h3>
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="channel-area">
          <div className="section-title">
            {selectedCategory ? selectedCategory.name : "Channels"} 
            {loading && <span style={{fontSize:'0.8rem', marginLeft:10, opacity:0.7}}>(Loading...)</span>}
          </div>

          <div className="grid">
            {channels.map((channel, idx) => (
              <div 
                key={idx} 
                className={`channel-card ${currentChannel === channel ? 'playing' : ''}`}
                onClick={() => playChannel(channel)}
              >
                {channel.logo ? (
                  <img src={channel.logo} alt={channel.name} className="channel-logo" loading="lazy" onError={(e) => e.target.style.display = 'none'}/>
                ) : (
                  <div className="channel-logo" style={{display:'flex',alignItems:'center',justifyContent:'center', color:'#555'}}><Play size={20}/></div>
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