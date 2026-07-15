// 1. Define your exact image dimensions
const imgWidth = 16384;
const imgHeight = 12288;
const maxZoom = 6;

// 2. Create a custom CRS that perfectly aligns bottom-up map coordinates with top-down image tiles
const customCRS = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1 / 64, 0, -1 / 64, 192)
});

// 3. Define the bounds of your map in original image pixels: [ [bottom, left], [top, right] ]
const bounds = [
    [0, 0],
    [imgHeight, imgWidth]
];

// 4. Initialize the map using our smart custom CRS and smooth wheel zooming
const map = L.map('map', {
    crs: customCRS,
    minZoom: 0,
    maxZoom: maxZoom,
    maxBounds: bounds,

    // --- SMOOTH WHEEL OPTIONS ---
    scrollWheelZoom: false,    // 1. Disable Leaflet's native jumpy zoom
    smoothWheelZoom: true,     // 2. Enable the smooth momentum zoom plugin
    smoothSensitivity: 1.2,    // 3. Zoom speed/sensitivity (Adjust to taste! 1 is standard, higher is faster)
    
    // --- MAP SNAP OPTIONS ---
    zoomSnap: 0,               // 4. MUST be 0 so the map can rest on fractional levels instead of snapping
    zoomDelta: 0.1             // 5. Keeps keyboard hotkeys (+ / -) zoom steps reasonably tight
});

// 5. Center the camera on the middle of your map
map.setView([imgHeight / 2, imgWidth / 2], 2);

// NOTE: Step 6 has been removed because LEVEL 1 (below) handles adding the world tiles!

// Coordinate system bounds remain 100% the same!
const mapBounds = [[0, 0], [12288, 16384]];
map.fitBounds(mapBounds);

let currentLevel = 'world';

// Create Layer Groups
const worldLayer = L.layerGroup().addTo(map); 
const cityLayer = L.layerGroup();             
const districtLayer = L.layerGroup();         


// ==========================================
// LEVEL 1: WORLD MAP LAYER (Tiled)
// ==========================================

// FIXED: Corrected path to {z}/{y}/{x}.png, removed duplicate/invalid crs option
const worldTiles = L.tileLayer('images/tiles_world/{z}/{y}/{x}.png', {
    minZoom: 0,
    maxZoom: 6,
    bounds: mapBounds,
    noWrap: true,
    errorTileUrl: 'images/tiles_world/blank.png'
}).addTo(worldLayer);

// Hafngard Boundaries on the World Map
const hafngardBounds = [[5440, 2952], [6808, 5207]];
const hafngardArea = L.rectangle(hafngardBounds, {
    color: "#d4af37",
    weight: 2,
    fillColor: "#d4af37",
    fillOpacity: 0.15,
    className: 'interactive-region'
}).addTo(worldLayer);

hafngardArea.bindPopup(`
    <div class="popup-content">
        <h2>Hafngard</h2>
        <p>A bustling, fortified harbor city nestled along the jagged northern cliffs.</p>
        <button onclick="loadCityMap()" class="popup-btn">Enter City Map</button>
    </div>
`);


// ==========================================
// LEVEL 2: CITY MAP LAYER (Tiled)
// ==========================================

// FIXED: Corrected path to {z}/{y}/{x}.png, removed duplicate/invalid crs option
const cityTiles = L.tileLayer('images/tiles_hafngard/{z}/{y}/{x}.png', {
    minZoom: 0,
    maxZoom: 6,
    bounds: mapBounds,
    noWrap: true
}).addTo(cityLayer);

// Thornreach District Boundaries
const thornreachBounds = [[2152, 6735], [2592, 12446]];
const thornreachArea = L.rectangle(thornreachBounds, {
    color: "#a0522d",
    weight: 2,
    fillColor: "#a0522d",
    fillOpacity: 0.15,
    className: 'interactive-region'
}).addTo(cityLayer);

thornreachArea.bindPopup(`
    <div class="popup-content">
        <h2>Thornreach Residential District</h2>
        <p>A quiet, tightly packed district housing the city's working-class citizens.</p>
        <button onclick="loadDistrictMap('thornreach')" class="popup-btn">Enter District</button>
    </div>
`);


// ==========================================
// LEVEL 3: DISTRICT MAP LAYER (Tiled)
// ==========================================

let activeDistrictTiles = null;

// The Crooked Keg
const crookedKegBounds = [[315, 343], [2507, 2712]];
const crookedKegArea = L.rectangle(crookedKegBounds, {
    color: "#8b1e0f",
    weight: 2,
    fillColor: "#8b1e0f",
    fillOpacity: 0.2,
    className: 'interactive-region'
}).addTo(districtLayer);

crookedKegArea.bindPopup(`
    <div class="popup-content">
        <h2>The Crooked Keg</h2>
        <p class="district-tag">Tavern & Brewery</p>
        <p>A lively local watering hole popular among the neighborhood's laborers.</p>
        <hr class="popup-divider">
        <p class="popup-lore"><strong>Proprietor:</strong> Barnaby "Two-Toes" Finch</p>
    </div>
`);


// ==========================================
// NAVIGATION & STATE MANAGEMENT
// ==========================================

function loadCityMap() {
    map.closePopup();
    map.removeLayer(worldLayer);
    map.addLayer(cityLayer);
    
    currentLevel = 'city';
    map.fitBounds(mapBounds);
    
    const backBtn = document.getElementById('back-btn');
    backBtn.style.display = 'block';
    backBtn.innerText = '← Back to World Map';
}

function loadDistrictMap(districtName) {
    map.closePopup();
    map.removeLayer(cityLayer);
    
    // Clean up old active district tiles if they exist
    if (activeDistrictTiles) {
        districtLayer.removeLayer(activeDistrictTiles);
    }
    
    // Dynamically point to the correct tiled directory
    let tilePath = '';
    if (districtName === 'thornreach') {
        // FIXED: Corrected path template here as well
        tilePath = 'images/tiles_thornreach/{z}/{y}/{x}.png';
    }
    
    activeDistrictTiles = L.tileLayer(tilePath, {
        minZoom: 0,
        maxZoom: 6,
        bounds: mapBounds,
        noWrap: true
    }).addTo(districtLayer);
    
    map.addLayer(districtLayer);
    
    currentLevel = 'district';
    map.fitBounds(mapBounds);
    
    const backBtn = document.getElementById('back-btn');
    backBtn.innerText = '← Back to City Map';
}

function handleBackNavigation() {
    map.closePopup();
    
    if (currentLevel === 'district') {
        map.removeLayer(districtLayer);
        map.addLayer(cityLayer);
        currentLevel = 'city';
        map.fitBounds(mapBounds);
        document.getElementById('back-btn').innerText = '← Back to World Map';
        
    } else if (currentLevel === 'city') {
        map.removeLayer(cityLayer);
        map.addLayer(worldLayer);
        currentLevel = 'world';
        map.fitBounds(mapBounds);
        document.getElementById('back-btn').style.display = 'none';
    }
}


// ==========================================
// DEVELOPER TOOL: COORDINATE FINDER
// ==========================================
const developerPopup = L.popup();
function onMapClick(e) {
    const clickCoords = e.latlng;
    const y = Math.round(clickCoords.lat);
    const x = Math.round(clickCoords.lng);
    
    developerPopup
        .setLatLng(clickCoords)
        .setContent(`<strong>Coordinates:</strong><br>X: ${x}<br>Y: ${y}`)
        .openOn(map);
}
map.on('click', onMapClick);