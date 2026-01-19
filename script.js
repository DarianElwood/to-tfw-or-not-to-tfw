const mapLocations = {
    "AB": {
      "name": "Alberta",
      "center": [50.28, -117.47],
      "zoom": 6, 
      "code": "AB"
    },
    "BC": {
      "name": "British Columbia",
      "center": [54.15, -124.00],
      "zoom": 6,
      "code": "BC"
    },
    "MB": {
      "name": "Manitoba",
      "center": [53.50, -95.50],
      "zoom": 6,
      "code": "MB"
    },
    "NB": {
      "name": "New Brunswick",
      "center": [46.34, -66.42],
      "zoom": 7,
      "code": "NB"
    },
    "NL": {
      "name": "Newfoundland and Labrador",
      "center": [54.50, -60.50],
      "zoom": 7,
      "code": "NL"
    },
    "NS": {
      "name": "Nova Scotia",
      "center": [45.22, -63.00],
      "zoom": 8,
      "code": "NS"
    },
    "NT": {
      "name": "Northwest Territories",
      "center": [67.00, -119.00],
      "zoom": 6,
      "code": "NT"
    },
    "NU": {
      "name": "Nunavut",
      "center": [68.00, -90.00],
      "zoom": 4.5,
      "code": "NU"
    },
    "ON": {
      "name": "Ontario",
      "center": [43.65, -79.38],
      "zoom": 8,
      "code": "ON"
    },
    "PE": {
      "name": "Prince Edward Island",
      "center": [46.50, -63.20],
      "zoom": 8,
      "code": "PE"
    },
    "QC": {
      "name": "Quebec",
      "center": [53.25, -68.43],
      "zoom": 5,
      "code": "QC"
    },
    "SK": {
      "name": "Saskatchewan",
      "center": [52.94, -106.45],
      "zoom": 6,
      "code": "SK"
    },
    "YT": {
      "name": "Yukon",
      "center": [65.00, -130.00],
      "zoom": 6,
      "code": "YT"
    }
  }


let lmiaData = [];
let map; // Store map in module scope so it's accessible to all functions
let markersClusterGroup; // Store marker cluster group
let programStream = 'all';
let selectProvince; // Will be initialized after DOM loads

const init = async () => {
    try {
        // Make sure map container exists
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            showError('Map container not found!');
            return;
        }

        // Show loading state
        showLoading(true);

        map = initMap();
        if (!map) {
            showError('Failed to initialize map.');
            return;
        }

        selectProvince = document.getElementById('province');
        if (!selectProvince) {
            showError('Province select not found!');
            return;
        }
        selectProvince.addEventListener('change', handleProvinceChange);
        
        const selectProgramStream = document.getElementById('program-stream');
        if (!selectProgramStream) {
            showError('Program stream select not found!');
            return;
        }
        selectProgramStream.addEventListener('change', handleProgramStreamChange);
        
        const loadSuccess = await loadLMIAData();
        if (!loadSuccess) {
            showError('Failed to load LMIA data. Please refresh the page.');
            showLoading(false);
            return;
        }

        // Initialize map with default province (Ontario) - setProvince will call plotPoints
        const defaultProvince = selectProvince.value || 'ON';
        setProvince(defaultProvince);
        showLoading(false);
    } catch (error) {
        console.error('Error initializing:', error);
        showError('An error occurred while initializing the application.');
        showLoading(false);
    }
}

// Load JSON data
const loadLMIAData = async () => {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        lmiaData = await response.json();
        console.log(`Loaded ${lmiaData.length} LMIA records`);
        return true;
    } catch (error) {
        console.error('Error loading LMIA data:', error);
        return false;
    }
}

const handleProvinceChange = (event) => {
    const selectedProvince = event.target.value;
    setProvince(selectedProvince);
}

const handleProgramStreamChange = (event) => {
    const province = selectProvince.value;
    const selectedProgramStream = event.target.value;
    programStream = selectedProgramStream;
    setProvince(province, programStream);
}

const initMap = () => {
    try {
        // Default to Ontario view (GTA centered)
        const leafletMap = L.map('map', {
            center: [43.65, -79.38],
            zoom: 8
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(leafletMap);

        return leafletMap;
    } catch (error) {
        console.error('Error initializing map:', error);
        return null;
    }
}

const setProvince = (province, stream = programStream) => {
    if (!map) {
        console.error('Map not initialized');
        return;
    }

    // Clear existing markers cluster group
    if (markersClusterGroup) {
        map.removeLayer(markersClusterGroup);
        markersClusterGroup = null;
    }

    let provinceData = mapLocations[province];
    if (!provinceData) {
        console.error(`No data found for province: ${province}`);
        return;
    }
    
    map.setView(provinceData.center, provinceData.zoom);
    
    // Plot points after setting the view
    plotPoints(province, stream);
}

// Escape HTML to prevent XSS
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const plotPoints = (province, programStream) => {
    if (!lmiaData || lmiaData.length === 0) {
        console.error('No LMIA data loaded');
        showEmptyState('No data available.');
        return;
    }

    let filteredData = lmiaData.filter(item => item["Province/Territory"] === mapLocations[province].name);
    
    // Filter by program stream if not 'all'
    if (programStream && programStream !== 'all') {
        filteredData = filteredData.filter(item => item["Program Stream"] === programStream);
    }

    console.log(`Plotting ${filteredData.length} markers for ${province}${programStream && programStream !== 'all' ? ` (${programStream})` : ''}`);

    // Show empty state if no markers found
    if (filteredData.length === 0) {
        showEmptyState(`No LMIA applications found${programStream && programStream !== 'all' ? ` for ${programStream} stream` : ''} in ${mapLocations[province].name}.`);
        return;
    }

    hideEmptyState();

    // Create marker cluster group for better performance
    markersClusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        chunkInterval: 200,
        chunkDelay: 50,
        maxClusterRadius: 50
    });

    // Create markers in batches to avoid blocking UI
    const markers = [];
    filteredData.forEach(item => {
        const lat = parseFloat(item.Latitude);
        const lon = parseFloat(item.Longitude);
        
        // Only add marker if coordinates are valid numbers
        if (!isNaN(lat) && !isNaN(lon)) {
            const marker = L.marker([lat, lon]);
            // Escape HTML content to prevent XSS
            marker.bindPopup(`
                <strong>${escapeHtml(item.Employer || 'Unknown')}</strong><br>
                ${escapeHtml(item.Address || 'Address not available')}<br>
                ${escapeHtml(item.Occupation || 'Occupation not available')}
            `);
            markers.push(marker);
        }
    });

    // Add all markers to cluster group at once (more efficient)
    markersClusterGroup.addLayers(markers);
    map.addLayer(markersClusterGroup);

    console.log(`Added ${markers.length} markers to cluster group`);
    
    // Update status for screen readers
    updateMapStatus(province, programStream, markers.length);
}

const updateMapStatus = (province, programStream, markerCount) => {
    const statusElement = document.getElementById('map-status');
    if (statusElement) {
        const provinceName = mapLocations[province]?.name || province;
        const streamText = programStream && programStream !== 'all' ? ` for ${programStream} stream` : '';
        statusElement.textContent = `Map updated: Showing ${markerCount} LMIA applications in ${provinceName}${streamText}.`;
    }
}

const showLoading = (show) => {
    let loadingEl = document.getElementById('loading');
    if (show) {
        if (!loadingEl) {
            loadingEl = document.createElement('div');
            loadingEl.id = 'loading';
            loadingEl.className = 'loading-message';
            loadingEl.textContent = 'Loading data...';
            const mapContainer = document.getElementById('map');
            if (mapContainer && mapContainer.parentNode) {
                mapContainer.parentNode.insertBefore(loadingEl, mapContainer);
            }
        }
        loadingEl.style.display = 'block';
    } else if (loadingEl) {
        loadingEl.style.display = 'none';
    }
}

const showError = (message) => {
    let errorEl = document.getElementById('error');
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.id = 'error';
        errorEl.className = 'error-message';
        errorEl.setAttribute('role', 'alert');
        const mapContainer = document.getElementById('map');
        if (mapContainer && mapContainer.parentNode) {
            mapContainer.parentNode.insertBefore(errorEl, mapContainer);
        }
    }
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

const showEmptyState = (message) => {
    let emptyEl = document.getElementById('empty-state');
    if (!emptyEl) {
        emptyEl = document.createElement('div');
        emptyEl.id = 'empty-state';
        emptyEl.className = 'empty-state-message';
        const mapContainer = document.getElementById('map');
        if (mapContainer && mapContainer.parentNode) {
            mapContainer.parentNode.insertBefore(emptyEl, mapContainer);
        }
    }
    emptyEl.textContent = message;
    emptyEl.style.display = 'block';
}

const hideEmptyState = () => {
    const emptyEl = document.getElementById('empty-state');
    if (emptyEl) {
        emptyEl.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    init();
});