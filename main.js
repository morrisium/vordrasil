// 1. Define your exact image dimensions
const imgWidth = 16384;
const imgHeight = 12288;
const maxZoom = 6;

// Set this to true if icons should start hidden until the cursor enters their area.
const HIDE_ICONS_BY_DEFAULT = true;

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
    minZoom: 2,
    maxZoom: maxZoom,
    maxBounds: null,
    zoomControl: false,

    // --- SMOOTH WHEEL OPTIONS ---
    scrollWheelZoom: false,    // 1. Disable Leaflet's native jumpy zoom
    smoothWheelZoom: true,     // 2. Enable the smooth momentum zoom plugin
    smoothSensitivity: 1.2,    // 3. Zoom speed/sensitivity (Adjust to taste! 1 is standard, higher is faster)

    // --- MAP SNAP OPTIONS ---
    zoomSnap: 0,               // 4. Snap to whole zoom levels so the generated tile folders match the requested URLs
    zoomDelta: 1               // 5. Keeps keyboard hotkeys (+ / -) zoom steps aligned with the tile set
});

// Coordinate system bounds remain 100% the same!
const mapBounds = [[0, 0], [12288, 16384]];
map.fitBounds(mapBounds);

const getMapCenter = () => [imgHeight / 2, imgWidth / 2];

function resetMapView() {
    const center = getMapCenter();
    map.setView(center, map.getMinZoom(), { animate: true });
    map.fitBounds(mapBounds, { animate: true, padding: [0, 0] });
}

const resetViewButton = document.getElementById('reset-view-btn');

if (resetViewButton) {
    resetViewButton.addEventListener('click', () => {
        resetMapView();
    });
}

let currentLevel = 'world';

// Create Layer Groups
const worldLayer = L.layerGroup().addTo(map); 
const cityLayer = L.layerGroup();
let activeCityTileLayer = null;
let activeDistrictLayer = null;

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
    minZoom: 2,
    maxZoom: 6,
    bounds: mapBounds,
    noWrap: true,
    errorTileUrl: 'images/tiles_world/blank.png',
    keepBuffer: 3,
    updatePrune: false,
    crossOrigin: false,
    className: 'map-tiles'
}).addTo(worldLayer);

let activeMarker = null;
let districtLayersByMap = new Map();

const setActiveMarker = (nextMarker) => {
    if (activeMarker && activeMarker !== nextMarker) {
        activeMarker._setActive(false);
        activeMarker._setHovered(false);
    }

    activeMarker = nextMarker;

    if (nextMarker) {
        nextMarker._setActive(true);
    }
};

fetch('locations.json')
  .then(response => response.json())
  .then(data => {
      // Helper function to safely escape HTML and format newlines
      const formatDescription = (text) => {
          // Escape HTML special characters to prevent injection
          const escaped = String(text || 'A notable location in Vordrasil.')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
          // Replace \n with <br> for display
          return escaped.replace(/\n/g, '<br>');
      };

      const getCityScale = () => Math.pow(2, map.getZoom() - maxZoom);
      const allMarkers = [];

      const createPopupContent = (title, description, popupButton, targetMap = '') => {
          const rawTargetMap = typeof popupButton?.targetMap === 'string' ? popupButton.targetMap.trim() : '';
          const normalizedTargetMap = rawTargetMap
              ? rawTargetMap.replace(/\/{z}\/\{y}\/\{x}\.png$/i, '').replace(/\/$/, '')
              : '';
          const shouldShowButton = popupButton?.visible && normalizedTargetMap;
          const buttonText = typeof popupButton?.text === 'string' ? popupButton.text : 'Enter City Map';
          const buttonHtml = shouldShowButton
              ? `<button onclick="loadCityMap('${normalizedTargetMap}')" class="popup-btn" ${popupButton.disabled ? 'disabled' : ''}>${buttonText}</button>`
              : '';

          return `
              <div class="popup-content">
                  <h2>${title}</h2>
                  <p>${formatDescription(description)}</p>
                  ${buttonHtml}
              </div>
          `;
      };

      const createLocationIcon = (location, scale = 1) => {
          const width = Math.max(1, Math.round((location.width || 220) * scale));
          const height = Math.max(1, Math.round((location.height || 64) * scale));
          const iconPath = location.icon || 'images/worldmap_icons/default.png';
          const iconAnchorX = width / 2;
          const iconAnchorY = height;

          return L.divIcon({
              className: 'elevating-city-marker',
              html: `
                  <div class="marker-container" style="width: ${width}px; height: ${height}px;">
                      <img src="${iconPath}" class="city-sprite" alt="${location.name}">
                  </div>
              `,
              iconSize: [width, height],
              iconAnchor: [iconAnchorX, iconAnchorY],
              popupAnchor: [0, -height]
          });
      };

      const createDistrictLayer = (location, targetMap) => {
          if (!Array.isArray(location.districts) || !location.districts.length || !targetMap) {
              return null;
          }

          const districtLayer = L.layerGroup();
          const popupTargetMap = targetMap;

          location.districts.forEach((district) => {
              const districtMarker = L.marker([district.y, district.x], {
                  icon: createLocationIcon({ ...district, name: district.name }, getCityScale()),
                  interactive: true
              }).addTo(districtLayer);

              const districtPopupButton = district.popupButton || { visible: false, disabled: true, targetMap: '', text: 'Enter City Map' };
              districtMarker.bindPopup(createPopupContent(district.name, district.description, districtPopupButton, popupTargetMap));

              const updateDistrictScale = () => {
                  const scale = getCityScale();
                  districtMarker.setIcon(createLocationIcon({ ...district, name: district.name }, scale));
              };

              districtMarker.on('add', updateDistrictScale);
              map.on('zoomend', updateDistrictScale);
              districtMarker.on('remove', () => {
                  map.off('zoomend', updateDistrictScale);
              });
          });

          districtLayersByMap.set(targetMap, districtLayer);
          return districtLayer;
      };

      Object.entries(data).forEach(([name, location]) => {
          const marker = L.marker([location.y, location.x], {
              icon: createLocationIcon({ ...location, name }, getCityScale()),
              interactive: true
          });

          // Initialize state BEFORE adding to layer
          marker._isActive = false;
          marker._isHovered = false;
          let iconVisible = !HIDE_ICONS_BY_DEFAULT;

          // Add to layer
          marker.addTo(worldLayer);

          // Immediately remove any highlight class
          const markerEl = marker.getElement();
          if (markerEl) {
              markerEl.classList.remove('is-active');
          }

          allMarkers.push(marker);

          const updateIconVisibility = (visible) => {
              const resolvedVisible = !HIDE_ICONS_BY_DEFAULT
                  ? true
                  : marker._isActive || marker._isHovered || visible;

              iconVisible = visible;
              const markerEl = marker.getElement();
              if (!markerEl) return;

              markerEl.style.opacity = resolvedVisible ? '1' : '0';
              markerEl.classList.toggle('is-active', marker._isActive);
          };

          // Call once to set initial state
          updateIconVisibility(iconVisible);

          const getIconBounds = () => {
              const point = map.latLngToContainerPoint([location.y, location.x]);
              const scale = getCityScale();
              const width = (location.width || 220) * scale;
              const height = (location.height || 64) * scale;
              const anchorX = Math.round(width / 2);
              const anchorY = Math.round(height);

              return {
                  left: point.x - anchorX,
                  right: point.x + (width - anchorX),
                  top: point.y - anchorY,
                  bottom: point.y + (height - anchorY)
              };
          };

          const isPointInIconArea = (point) => {
              const bounds = getIconBounds();
              return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
          };

          const updateMarkerScale = () => {
              const scale = getCityScale();
              marker.setIcon(createLocationIcon({ ...location, name }, scale));
              updateIconVisibility(iconVisible);
          };

          marker._setActive = (isActive) => {
              marker._isActive = !!isActive;
              if (!isActive) {
                  marker._isHovered = false;
              }
              updateIconVisibility(iconVisible);
          };

          marker._setHovered = (isHovered) => {
              marker._isHovered = !!isHovered;
              updateIconVisibility(iconVisible);
          };

          const handleMouseMove = (e) => {
              if (!HIDE_ICONS_BY_DEFAULT) return;
              const point = map.mouseEventToContainerPoint(e.originalEvent);
              if (activeMarker === marker) {
                  marker._setHovered(true);
                  return;
              }
              marker._setHovered(isPointInIconArea(point));
          };

          map.on('zoomend', updateMarkerScale);
          map.on('mousemove', handleMouseMove);

          const popupButton = location.popupButton || { visible: false, disabled: true, targetMap: '', text: 'Enter City Map' };
          const rawTargetMap = typeof popupButton.targetMap === 'string' ? popupButton.targetMap.trim() : '';
          const normalizedTargetMap = rawTargetMap
              ? rawTargetMap.replace(/\/{z}\/{y}\/{x}\.png$/i, '').replace(/\/$/, '')
              : '';
          marker.bindPopup(createPopupContent(name, location.description, popupButton, normalizedTargetMap));
          createDistrictLayer(location, normalizedTargetMap);

          marker.on('click', () => setActiveMarker(marker));
          marker.on('popupopen', () => setActiveMarker(marker));
          marker.on('popupclose', () => {
              if (activeMarker === marker) {
                  setActiveMarker(null);
              }
          });
      });
  })
  .catch(err => console.error("Could not load locations.json. Make sure to generate it first! ", err));

// ==========================================
// LEVEL 2: CITY MAP LAYER (Tiled)
// ==========================================

const createCityTileLayer = (tileFolder) => L.tileLayer(`${tileFolder}/{z}/{y}/{x}.png`, {
    minZoom: 2,
    maxZoom: 6,
    bounds: mapBounds,
    noWrap: true,
    errorTileUrl: 'images/tiles_world/blank.png',
    keepBuffer: 3,
    updatePrune: false,
    crossOrigin: false,
    className: 'map-tiles'
});

const defaultCityTileLayer = createCityTileLayer('images/tiles_hafngard');
activeCityTileLayer = defaultCityTileLayer;
defaultCityTileLayer.addTo(cityLayer);

createInteractiveIconOverlayMarker([2372, 9590.5], 200, 300, 220, 64, 2).addTo(cityLayer);

// ==========================================
// NAVIGATION & STATE MANAGEMENT
// ==========================================

function loadCityMap(targetMap = '') {
    const normalizedTargetMap = typeof targetMap === 'string'
        ? targetMap.trim().replace(/\/{z}\/{y}\/{x}\.png$/i, '').replace(/\/$/, '')
        : '';

    if (!normalizedTargetMap) {
        return;
    }

    map.closePopup();

    if (activeCityTileLayer) {
        cityLayer.removeLayer(activeCityTileLayer);
    }

    activeCityTileLayer = createCityTileLayer(normalizedTargetMap);
    activeCityTileLayer.addTo(cityLayer);

    map.removeLayer(worldLayer);
    map.addLayer(cityLayer);

    if (activeDistrictLayer) {
        cityLayer.removeLayer(activeDistrictLayer);
        activeDistrictLayer = null;
    }

    const districtLayer = districtLayersByMap.get(normalizedTargetMap) || null;
    if (districtLayer) {
        districtLayer.addTo(cityLayer);
        activeDistrictLayer = districtLayer;
    }

    currentLevel = 'city';
    map.fitBounds(mapBounds);

    const backBtn = document.getElementById('back-btn');
    backBtn.style.display = 'block';
    backBtn.innerText = '← Back to World Map';
}

function handleBackNavigation() {
    map.closePopup();
    
    if (currentLevel === 'city') {
        if (activeDistrictLayer) {
            cityLayer.removeLayer(activeDistrictLayer);
            activeDistrictLayer = null;
        }
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

    if (activeMarker) {
        setActiveMarker(null);
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