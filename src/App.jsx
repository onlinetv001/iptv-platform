import React, { useEffect, useState, useRef } from 'react';
import Hls from 'hls.js';
import { Play, Tv, Menu, X, Copy, ExternalLink, Lock, Search } from 'lucide-react'; // Added 'Search' icon
import './App.css';

// --- CONFIGURATION ---
const PUBLIC_CATEGORIES_API = 'https://iptv-org.github.io/api/categories.json';
const ADMIN_PASSWORD = "superuser007"; 

const HIDDEN_CATEGORIES = [
  { id: 'premium-movies', name: 'Premium Movies' },
];

const getLocalPlaylistPath = (filename) => {
  const baseUrl = import.meta.env.BASE_URL;
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBase}/playlists/${filename}`;
};

const LOCAL_FILES = {
  'premium-movies': getLocalPlaylistPath('premium_movie.m3u'),
};
// --- END CONFIGURATION ---

const App = () => {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  // NEW: Search State
  const [searchTerm, setSearchTerm] = useState("");

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => {
    fetch(PUBLIC_CATEGORIES_API)
      .then(res => res.json())
      .then(publicData => {
        let combined = [...publicData];
        if (isUnlocked) combined = [...HIDDEN_CATEGORIES, ...combined];
        
        const unique = combined.filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i);
        const sorted = unique.sort((a, b) => {
            if (a.id === 'premium-movies') return -1;
            if (b.id === 'premium-movies') return 1;
            return a.name.localeCompare(b.name);
        });

        setCategories(sorted);
        
        if (isUnlocked) {
             const premium = sorted.find(c => c.id === 'premium-movies');
             if (premium) handleCategoryClick(premium);
        } else if (!selectedCategory && sorted.length > 0) {
             handleCategoryClick(sorted[0]);
        }
      })
      .catch(err => console.error("Database Error:", err));
  }, [isUnlocked]);

  const handleLogoClick = () => {
    if (isUnlocked) return;
    const input = prompt("Enter Admin Password:");
    if (input === ADMIN_PASSWORD) {
        setIsUnlocked(true);
        alert("🔓 Premium Unlocked!");
    } else if (input !== null) alert("❌ Wrong Password");
  };

  const handleCategoryClick = (category) => {
    setSelectedCategory(category);
    setIsSidebarOpen(false);
    setLoading(true);
    setChannels([]);
    setSearchTerm(""); // Reset search when switching categories

    let playlistUrl;
    if (LOCAL_FILES[category.id]) {
      playlistUrl = LOCAL_FILES[category.id];
    } else {
      playlistUrl = `https://iptv-org.github.io/iptv/categories/${category.id}.m3u`;
    }

    fetch(playlistUrl)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text(); })
      .then(text => {
        setChannels(parseM3U(text));
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
        const logoMatch = line.match(/tvg-logo=["']([^"']+)["']/);
        if (logoMatch && logoMatch[1]) currentItem.logo = logoMatch[1];
        const lastCommaIndex = line.lastIndexOf(',');
        if (lastCommaIndex !== -1) {
            currentItem.name = line.substring(lastCommaIndex + 1).trim();
        } else {
             const titleMatch = line.match(/,([^,]+)$/);
             currentItem.name = titleMatch ? titleMatch[1] : "Unknown";
        }
      } else if (!line.startsWith('#')) {
        currentItem.url = line;
        if (currentItem.name && currentItem.url) result.push(currentItem);
        currentItem = { name: null, logo: null, url: null };
      }
    });
    return result;
  };

const playChannel = (channel) => {
    setCurrentChannel(channel);
    setIsVideoLoading(true);
    if (hlsRef.current) hlsRef.current.destroy();

    // 1. PASTE YOUR CLOUDFLARE WORKER URL HERE 👇
    const myProxy = 'https://iptv-platform.nikhil271200meshram.workers.dev/?url='; 
    
    let streamUrl = channel.url;
    
    // 2. Logic: If the link is HTTP (Insecure), wrap it in the Proxy (Secure)
    if (streamUrl.startsWith('http://') || streamUrl.includes('adultiptv')) {
        streamUrl = myProxy + encodeURIComponent(channel.url);
        console.log("Proxying Insecure Stream:", streamUrl);
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          manifestLoadingTimeOut: 15000
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => videoRef.current?.play().catch(()=>{}));
      hls.on(Hls.Events.ERROR, (e, data) => { 
          if (data.fatal) { hls.destroy(); setIsVideoLoading(false); } 
      });
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = streamUrl;
      videoRef.current.play();
    }
  };

  const copyLink = () => {
    if (currentChannel?.url) {
        navigator.clipboard.writeText(currentChannel.url);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  // --- FILTER CHANNELS BASED ON SEARCH ---
  const filteredChannels = channels.filter(channel => 
    channel.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="app-container">
      {isSidebarOpen && <div className="overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* Sidebar */}
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="logo" onClick={handleLogoClick} style={{cursor: 'pointer'}}>
          {isUnlocked ? <Lock size={24} color="#e50914" /> : <Tv style={{marginBottom:-2}}/>} 
          Online TV
          <X className="close-btn" size={24} style={{marginLeft:'auto', cursor:'pointer'}} onClick={(e) => { e.stopPropagation(); setIsSidebarOpen(false); }}/> 
        </div>
        <div className="category-list">
          {categories.map(cat => (
            <div key={cat.id} className={`category-item ${selectedCategory?.id === cat.id ? 'active' : ''}`} onClick={() => handleCategoryClick(cat)}>
              {cat.name}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="mobile-header">
           <div style={{fontWeight:'bold', display:'flex', alignItems:'center', gap:10}} onClick={handleLogoClick}>
             <Tv color="#e50914"/> Online TV
           </div>
           <button onClick={() => setIsSidebarOpen(true)} style={{background:'none', border:'none', color:'white'}}><Menu size={28}/></button>
        </div>

        <div className="player-wrapper">
          {isVideoLoading && <div style={{position:'absolute', zIndex:10}}><div className="loader"></div></div>}
          {currentChannel ? (
            <>
              <video ref={videoRef} controls autoPlay poster={currentChannel.logo} onPlaying={() => setIsVideoLoading(false)} onWaiting={() => setIsVideoLoading(true)} playsInline />
              <div style={{position:'absolute', bottom: 10, right: 10, zIndex: 20, display: 'flex', gap: '10px'}}>
                 <button onClick={copyLink} style={{background: '#333', color: 'white', border: '1px solid #555', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5}}>
                    <Copy size={16}/> {copyFeedback ? "Copied!" : "Copy"}
                 </button>
                 <a href={`intent:${currentChannel.url}#Intent;type=video/*;scheme=http;package=org.videolan.vlc;end`} style={{background: '#ff5500', color: 'white', padding: '8px 12px', borderRadius: '4px', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 5}}>
                    <ExternalLink size={16}/> VLC
                 </a>
              </div>
            </>
          ) : (
            <div className="placeholder">
              <Tv size={48} />
              <h3>Select a channel</h3>
            </div>
          )}
        </div>

        {/* Channel Grid with SEARCH */}
        <div className="channel-area">
          <div className="search-container">
             <div className="search-wrapper">
               <Search className="search-icon" size={20} />
               <input 
                 type="text" 
                 className="search-input" 
                 placeholder={`Search in ${selectedCategory ? selectedCategory.name : 'channels'}...`}
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
             </div>
             {loading && <span style={{fontSize:'0.8rem', marginLeft:10, opacity:0.7, whiteSpace:'nowrap'}}>Loading...</span>}
          </div>

          <div className="section-title">
             {selectedCategory ? selectedCategory.name : "Channels"} 
             <span style={{float:'right', fontSize:'0.8rem', opacity:0.5}}>{filteredChannels.length} results</span>
          </div>
          
          <div className="grid">
            {filteredChannels.length > 0 ? (
              filteredChannels.map((channel, idx) => (
                <div key={idx} className={`channel-card ${currentChannel === channel ? 'playing' : ''}`} onClick={() => playChannel(channel)}>
                  {channel.logo ? (
                    <img src={channel.logo} alt={channel.name} className="channel-logo" loading="lazy" onError={(e) => e.target.style.display = 'none'}/>
                  ) : (
                    <div className="channel-logo" style={{display:'flex',alignItems:'center',justifyContent:'center', color:'#555'}}><Play size={20}/></div>
                  )}
                  <div className="channel-name">{channel.name}</div>
                </div>
              ))
            ) : (
              <div style={{gridColumn: '1/-1', textAlign:'center', padding: 20, color:'#666'}}>
                No channels found matching "{searchTerm}"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;