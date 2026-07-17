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

// Coordinate system bounds remain 100% the same!
const mapBounds = [[0, 0], [12288, 16384]];
map.fitBounds(mapBounds);

let currentLevel = 'world';

// Create Layer Groups
const worldLayer = L.layerGroup().addTo(map); 
const cityLayer = L.layerGroup();             

const iconAtlas = new Image();
iconAtlas.src = 'images/iconstext.png';

function renderMarkerSprite(canvas, spriteX, spriteY) {
    const context = canvas.getContext('2d');
    if (!context) return;

    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);

    if (!iconAtlas.complete || !iconAtlas.naturalWidth) {
        iconAtlas.addEventListener('load', () => renderMarkerSprite(canvas, spriteX, spriteY), { once: true });
        return;
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(iconAtlas, Math.round(spriteX), Math.round(spriteY), width, height, 0, 0, width, height);
}

function createInteractiveIconOverlayMarker(latlng, spriteX, spriteY, width = 220, height = 64, baseZoom = 2) {
    const baseIconHtml = `
                <div class="location-marker-wrap">
                    <canvas class="location-marker-canvas" width="${width}" height="${height}"></canvas>
                </div>
            `;

    const createIcon = () => L.divIcon({
        html: baseIconHtml,
        className: 'location-marker-icon',
        iconSize: [width, height],
        iconAnchor: [Math.round(width / 2), height]
    });

    const marker = L.marker(latlng, {
        icon: createIcon(),
        interactive: false,
        draggable: false
    });

    let zoomHandler = null;

    marker.on('add', function () {
        const markerRoot = this.getElement();
        if (!markerRoot) return;

        const wrap = markerRoot.querySelector('.location-marker-wrap');
        const canvas = markerRoot.querySelector('.location-marker-canvas');
        if (!wrap || !canvas) return;

        wrap.style.transformOrigin = 'bottom center';
        wrap.style.willChange = 'transform';
        wrap.style.pointerEvents = 'none';

        const updateScale = () => {
            const zoomScale = Math.pow(2, map.getZoom() - baseZoom);
            wrap.style.transform = `scale(${zoomScale})`;
            marker.setIcon(createIcon());
        };

        updateScale();
        zoomHandler = updateScale;
        map.on('zoomend', zoomHandler);

        marker.on('remove', () => {
            if (zoomHandler) {
                map.off('zoomend', zoomHandler);
                zoomHandler = null;
            }
        });

        const context = canvas.getContext('2d');
        if (!context) return;

        renderMarkerSprite(canvas, spriteX, spriteY);
    });

    return marker;
}

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

fetch('cities.json')
  .then(response => response.json())
  .then(data => {
      const hafngard = data.Hafngard;

      const baseWidth = hafngard.width;
      const baseHeight = hafngard.height;

      const createCityIcon = (scale = 1) => {
          const width = Math.max(1, Math.round(baseWidth * scale));
          const height = Math.max(1, Math.round(baseHeight * scale));

          return L.divIcon({
              className: 'elevating-city-marker',
              html: `
                  <div class="marker-container" style="width: ${width}px; height: ${height}px;">
                      <img src="images/worldmap_icons/hafngard.png" class="city-sprite" alt="Hafngard">
                  </div>
              `,
              iconSize: [width, height],
              iconAnchor: [Math.round(width / 2), Math.round(height / 2)],
              popupAnchor: [0, -Math.round(height / 2)]
          });
      };

      const getCityScale = () => Math.pow(2, map.getZoom() - maxZoom);
      const marker = L.marker([hafngard.y, hafngard.x], { icon: createCityIcon(getCityScale()), interactive: true }).addTo(worldLayer);

      const updateCityMarkerScale = () => {
          const scale = getCityScale();
          marker.setIcon(createCityIcon(scale));
      };

      marker.on('add', () => updateCityMarkerScale());
      map.on('zoomend', updateCityMarkerScale);

      marker.bindPopup(`
          <div class="popup-content">
              <h2>Hafngard</h2>
              <p>A bustling, fortified harbor city nestled along the jagged northern cliffs.</p>
              <button onclick="loadCityMap()" class="popup-btn">Enter City Map</button>
          </div>
      `);
  })
  .catch(err => console.error("Could not load cities.json. Make sure to generate it first! ", err));

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

createInteractiveIconOverlayMarker([2372, 9590.5], 200, 300, 220, 64, 2).addTo(cityLayer);

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

function handleBackNavigation() {
    map.closePopup();
    
    if (currentLevel === 'city') {
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
    const target = e.originalEvent?.target;
    if (target && target.closest && target.closest('.location-marker-wrap, .elevating-city-marker, .marker-container')) {
        return;
    }

    const clickCoords = e.latlng;
    const y = Math.round(clickCoords.lat);
    const x = Math.round(clickCoords.lng);
    
    developerPopup
        .setLatLng(clickCoords)
        .setContent(`<strong>Coordinates:</strong><br>X: ${x}<br>Y: ${y}`)
        .openOn(map);
}
map.on('click', onMapClick);