/*  
====================================================================

FAST SEARCH — 
https://gist.github.com/cmod/5410eae147e4318164258742dd053993
Updated to work with fuse 7 (Jan 2025)
Updated Feb 2025 — no more fuse dependency, more modern js, 
   proper config items, ability to easily modify shortcut, 
   general speed improvements

==================================================================== 
*/
// Configuration
const DEFAULT_CONFIG = {
    shortcuts: {
      open: {                    // Shortcut to open/close search
        key: '/',                // The key to trigger the shortcut
        metaKey: true,          // Requires Cmd/Win key
        altKey: false,          // Requires Alt key
        ctrlKey: false,         // Requires Ctrl key
        shiftKey: false         // Requires Shift key
      }
    },
    search: {
      minChars: 2,              // Minimum characters before searching
      maxResults: 5,            // Maximum number of results to show
      fields: {                 // Fields to search through
        title: true,            // Allow searching in title
        description: true,      // Allow searching in description
        section: true           // Allow searching in section
      }
    }
  };
  
  // Function to initialize search with custom config
  function initSearch(userConfig = {}) {
    // Deep merge of default config with user config
    const CONFIG = mergeConfigs(DEFAULT_CONFIG, userConfig);
    
    // Cache DOM elements
    const fastSearch = document.getElementById('fastSearch');
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
  
    let searchIndex = null;
    let searchVisible = false;
    let resultsAvailable = false;
    let firstRun = true;
  
    // Load the search index
    async function loadSearchIndex() {
      try {
        const response = await fetch('/index.json');
        if (!response.ok) throw new Error('Failed to load search index');
        const data = await response.json();
        
        searchIndex = data.map(item => ({
          ...item,
          searchableTitle: item.title?.toLowerCase() || '',
          searchableDesc: item.desc?.toLowerCase() || '',
          searchableSection: item.section?.toLowerCase() || ''
        }));
        
        if (searchInput.value) {
          performSearch(searchInput.value);
        }
      } catch (error) {
        console.error('Error loading search index:', error);
        searchResults.innerHTML = '<li class="search-message">Error loading search index...</li>';
      }
    }
  
    // Simple fuzzy match for single words
    function simpleFuzzyMatch(text, term) {
      if (text.includes(term)) return true;
      if (term.length < 3) return false;
  
      let matches = 0;
      let lastMatchIndex = -1;
  
      for (let i = 0; i < term.length; i++) {
        const found = text.indexOf(term[i], lastMatchIndex + 1);
        if (found > -1) {
          matches++;
          lastMatchIndex = found;
        }
      }
  
      return matches === term.length;
    }
  
    // Check if keyboard event matches shortcut config
    function matchesShortcut(event, shortcutConfig) {
      return event.key === shortcutConfig.key &&
             event.metaKey === shortcutConfig.metaKey &&
             event.altKey === shortcutConfig.altKey &&
             event.ctrlKey === shortcutConfig.ctrlKey &&
             event.shiftKey === shortcutConfig.shiftKey;
    }
  
    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      // Check for configured search shortcut
      if (matchesShortcut(event, CONFIG.shortcuts.open)) {
        event.preventDefault();
        searchVisible = !searchVisible;
        fastSearch.style.visibility = searchVisible ? 'visible' : 'hidden';
        
        if (searchVisible) {
          if (firstRun) {
            loadSearchIndex();
            firstRun = false;
          }
          searchInput.focus();
          searchInput.value = '';
        } else {
          searchInput.blur();
          searchResults.innerHTML = '';
        }
      }
  
      // ESC to close search
      if (event.key === 'Escape' && searchVisible) {
        fastSearch.style.visibility = 'hidden';
        searchInput.blur();
        searchInput.value = '';
        searchResults.innerHTML = '';
        searchVisible = false;
      }
      
      // Enter to select first result
      if (event.key === 'Enter' && searchVisible) {
        const firstResult = searchResults.querySelector('a');
        if (firstResult) {
          event.preventDefault();
          window.location.href = firstResult.href;
        }
      }
  
      // Arrow navigation
      if (searchVisible && resultsAvailable) {
        const links = Array.from(searchResults.getElementsByTagName('a'));
        if (!links.length) return;
  
        const first = links[0];
        const last = links[links.length - 1];
        const active = document.activeElement;
        
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (active === searchInput) {
            first.focus();
          } else if (active.tagName === 'A') {
            const currentIndex = links.indexOf(active);
            if (currentIndex !== -1 && currentIndex < links.length - 1) {
              links[currentIndex + 1].focus();
            }
          }
        }
        
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          if (active === first) {
            searchInput.focus();
          } else if (active.tagName === 'A') {
            const currentIndex = links.indexOf(active);
            if (currentIndex > 0) {
              links[currentIndex - 1].focus();
            } else {
              searchInput.focus();
            }
          }
        }
      }
    });
  
    function performSearch(term) {
      term = term.toLowerCase().trim();
      
      if (!term || !searchIndex) {
        searchResults.innerHTML = '';
        resultsAvailable = false;
        return;
      }
  
      if (term.length < CONFIG.search.minChars) {
        searchResults.innerHTML = '<li class="search-message">Please enter at least 2 characters...</li>';
        resultsAvailable = false;
        return;
      }
  
      // Split search into terms
      const searchTerms = term.split(/\s+/).filter(t => t.length > 0);
      
      // Search with scoring
      const results = searchIndex
        .map(item => {
          let score = 0;
          const matchesAllTerms = searchTerms.every(term => {
            let matched = false;
            
            // Title matches (weighted higher)
            if (CONFIG.search.fields.title) {
              if (item.searchableTitle.startsWith(term)) {
                score += 3;  // Highest score for prefix matches in title
                matched = true;
              } else if (simpleFuzzyMatch(item.searchableTitle, term)) {
                score += 2;  // Good score for fuzzy matches in title
                matched = true;
              }
            }
            
            // Other field matches
            if (!matched) {
              if (CONFIG.search.fields.description && item.searchableDesc.includes(term)) {
                score += 0.5;  // Lower score for description matches
                matched = true;
              }
              if (CONFIG.search.fields.section && item.searchableSection.includes(term)) {
                score += 0.5;  // Lower score for section matches
                matched = true;
              }
            }
            
            return matched;
          });
  
          return {
            item,
            score: matchesAllTerms ? score : 0
          };
        })
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, CONFIG.search.maxResults)
        .map(result => result.item);
  
      resultsAvailable = results.length > 0;
      
      if (!resultsAvailable) {
        searchResults.innerHTML = '<li class="search-message">No matching results found...</li>';
        return;
      }
  
      const searchItems = results.map(item => `
        <li>
          <a href="${escapeHtml(item.permalink)}" tabindex="0">
            <span class="title">${escapeHtml(item.title)}</span><br />
            <span class="sc">${escapeHtml(item.section)}</span> — 
            ${escapeHtml(item.date)} — 
            <em>${escapeHtml(item.desc)}</em>
          </a>
        </li>
      `).join('');
      
      searchResults.innerHTML = searchItems;
    }
  
    searchInput.addEventListener('input', function() {
      if (!searchIndex && !firstRun) {
        searchResults.innerHTML = '<li class="search-message">Loading search index...</li>';
        return;
      }
      performSearch(this.value);
    });
  
    // Add minimal styles
    const style = document.createElement('style');
    style.textContent = `
      .search-message {
        padding: 8px;
        color: #666;
        font-style: italic;
      }
  
      #searchResults li {
        animation: fadeSlideIn 0.2s ease-out;
        animation-fill-mode: both;
      }
  
      #searchResults li:nth-child(1) { animation-delay: 0.0s; }
      #searchResults li:nth-child(2) { animation-delay: 0.02s; }
      #searchResults li:nth-child(3) { animation-delay: 0.04s; }
      #searchResults li:nth-child(4) { animation-delay: 0.06s; }
      #searchResults li:nth-child(5) { animation-delay: 0.08s; }
  
      @keyframes fadeSlideIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Helper function to deep merge configs
  function mergeConfigs(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };
    
    for (const [key, value] of Object.entries(userConfig)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = mergeConfigs(defaultConfig[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }
  
  // Basic HTML escaping for security
  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  
  // Initialize with default config
  initSearch();