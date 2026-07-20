// 1. Define your exact image dimensions
const imgWidth = 16384;
const imgHeight = 12288;
const maxZoom = 6;

// Set this to true if icons should start hidden until the cursor enters their area.
const HIDE_ICONS_BY_DEFAULT = true;

// DEBUG: Change this to load a different map on first load
// Options: 'world', 'hafngard', 'mogilsa', 'thornreach', etc.
const DEBUG_INITIAL_MAP = 'world';

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
const panelToggleButton = document.getElementById('panel-toggle-btn');
const panelToggleText = document.querySelector('.toggle-text');
const panelLocationGroup = document.getElementById('panel-location-group');
const panelLocationToggleButton = document.getElementById('panel-side-toggle-btn');
const panelLocationText = document.querySelector('.panel-location-text');
const popupPanel = document.getElementById('popup-panel');
const searchInput = document.getElementById('search-input');
const searchClearButton = document.getElementById('search-clear');
let panelMode = false;
let panelSideRight = false;
window.panelMode = panelMode;
window.panelSideRight = panelSideRight;
let justClickedMarker = false;

function isMobileViewport() {
    return window.matchMedia('(max-width: 767px)').matches;
}

function updateViewportMode() {
    const mobile = isMobileViewport();
    document.body.classList.toggle('mobile-view', mobile);
    document.body.classList.toggle('desktop-view', !mobile);
}

window.addEventListener('resize', updateViewportMode);
window.addEventListener('orientationchange', updateViewportMode);
updateViewportMode();

// --- Cookie helpers for simple settings persistence ---
function setCookie(name, value, days = 365) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/";
}

function getCookie(name) {
    const cname = name + "=";
    const decoded = decodeURIComponent(document.cookie || "");
    const parts = decoded.split(';');
    for (let i = 0; i < parts.length; i++) {
        let c = parts[i].trim();
        if (c.indexOf(cname) === 0) return c.substring(cname.length, c.length);
    }
    return null;
}

function loadSettingsFromCookies() {
    const pm = getCookie('panelMode');
    const ps = getCookie('panelSideRight');
    if (pm !== null) {
        panelMode = pm === '1' || pm === 'true';
        if (panelToggleButton) {
            panelToggleButton.checked = panelMode;
            panelToggleButton.setAttribute('aria-checked', String(panelMode));
        }
    }
    if (ps !== null) {
        panelSideRight = ps === '1' || ps === 'true';
        if (panelLocationToggleButton) panelLocationToggleButton.checked = panelSideRight;
        window.panelSideRight = panelSideRight;
    }
}

function updatePanelLocationVisibility() {
    if (panelLocationGroup) {
        panelLocationGroup.classList.toggle('visible', panelMode);
    }
}

function updatePanelLocationText() {
    if (panelLocationText) {
        panelLocationText.textContent = `Panel Side: ${panelSideRight ? 'Right' : 'Left'}`;
    }
}

function updatePanelSideAppearance() {
    if (!popupPanel) return;
    popupPanel.classList.toggle('right', panelSideRight);
    if (panelLocationToggleButton) {
        panelLocationToggleButton.checked = panelSideRight;
    }
    updatePanelLocationText();
}

function closePanelPopup() {
    if (!popupPanel) return;
    popupPanel.classList.remove('open');
    popupPanel.setAttribute('aria-hidden', 'true');
    popupPanel.style.display = 'none';
    popupPanel.innerHTML = '';
}
window.closePanelPopup = closePanelPopup;

if (resetViewButton) {
    resetViewButton.addEventListener('click', () => {
        resetMapView();
    });
}

if (panelToggleButton && popupPanel) {
    panelToggleButton.addEventListener('change', () => {
        panelMode = panelToggleButton.checked;
        panelToggleButton.setAttribute('aria-checked', String(panelMode));
        updatePanelLocationVisibility();
        if (panelToggleText) {
            panelToggleText.textContent = panelMode ? 'Location Panel' : 'Location Popups';
        }

        if (!panelMode) {
            closePanelPopup();
        } else if (popupPanel.innerHTML.trim()) {
            popupPanel.classList.add('open');
            popupPanel.setAttribute('aria-hidden', 'false');
        }
        // persist panel mode
        try { setCookie('panelMode', panelMode ? '1' : '0', 365); } catch (e) { /* ignore */ }
    });
}

if (panelLocationToggleButton) {
    panelLocationToggleButton.addEventListener('change', () => {
        panelSideRight = panelLocationToggleButton.checked;
        window.panelSideRight = panelSideRight;
        updatePanelSideAppearance();
        // persist panel side preference
        try { setCookie('panelSideRight', panelSideRight ? '1' : '0', 365); } catch (e) { /* ignore */ }
    });
}

const allMarkers = [];

const normalizeSearchString = (text) => {
    return String(text || '').toLowerCase().trim();
};

const buildSearchText = (name, description, notableCharacters = [], keyEvents = []) => {
    const parts = [name, description];
    if (Array.isArray(notableCharacters)) {
        notableCharacters.forEach((item) => {
            parts.push(item.name || '');
            parts.push(item.description || '');
        });
    }
    if (Array.isArray(keyEvents)) {
        keyEvents.forEach((item) => {
            parts.push(item.name || '');
            parts.push(item.description || '');
        });
    }
    return normalizeSearchString(
        parts
            .filter((part) => typeof part === 'string' && part.trim().length)
            .join(' ')
    );
};

const reapplyMarkerSearchHighlight = (marker) => {
    const markerEl = marker.getElement();
    if (!markerEl) return;
    markerEl.classList.toggle('search-match', !!marker._searchMatch);
    if (marker._searchMatch) {
        markerEl.style.visibility = 'visible';
        markerEl.style.opacity = '1';
        markerEl.style.display = 'block';
    }
};

const updateSearchHighlights = (query) => {
    const normalizedQuery = normalizeSearchString(query);
    const hasQuery = normalizedQuery.length > 0;
    const matchedMapTargets = new Set();

    allMarkers.forEach((marker) => {
        const isSelfMatch = hasQuery && marker.searchText && marker.searchText.includes(normalizedQuery);
        marker._selfMatch = isSelfMatch;
        if (isSelfMatch && marker._mapTarget) {
            matchedMapTargets.add(marker._mapTarget);
        }
    });

    const expandedMapTargets = new Set(matchedMapTargets);
    const queue = [...matchedMapTargets];
    while (queue.length) {
        const target = queue.shift();
        const info = mapInfoByTarget.get(target);
        if (info && info.parent && info.parent !== 'world' && !expandedMapTargets.has(info.parent)) {
            expandedMapTargets.add(info.parent);
            queue.push(info.parent);
        }
    }

    allMarkers.forEach((marker) => {
        const leadsToMatch = marker._targetMap && expandedMapTargets.has(marker._targetMap);
        const isMatch = marker._selfMatch || leadsToMatch;
        marker._searchMatch = isMatch;
        marker._searchVisible = isMatch;
        reapplyMarkerSearchHighlight(marker);
        if (typeof marker._setHovered === 'function') {
            if (isMatch) {
                marker._setHovered(true);
                if (typeof marker._refreshIconVisibility === 'function') {
                    marker._refreshIconVisibility();
                }
            } else if (marker !== activeMarker) {
                marker._setHovered(false);
            }
        }
    });
};

if (searchClearButton && searchInput) {
    searchClearButton.addEventListener('click', () => {
        searchInput.value = '';
        updateSearchHighlights('');
        searchInput.focus();
    });
}

if (searchInput) {
    searchInput.addEventListener('input', () => {
        updateSearchHighlights(searchInput.value);
    });
}

// Load persisted settings (if any) before rendering initial UI state
try { loadSettingsFromCookies(); } catch (e) { /* ignore */ }
updatePanelLocationVisibility();
updatePanelSideAppearance();

map.on('zoomend', () => {
    if (searchInput) {
        updateSearchHighlights(searchInput.value);
    }
});

// Cog menu behavior: toggle the settings menu that contains the panel controls
const cogBtn = document.getElementById('cog-btn');
const cogMenu = document.getElementById('cog-menu');
let cogMenuOpen = false;
let _cogOriginalParent = null;
let _cogOriginalNextSibling = null;
let _cogOverlay = null;

function setCogMenu(open) {
    if (!cogMenu || !cogBtn) return;
    cogMenuOpen = !!open;
    cogMenu.classList.toggle('open', cogMenuOpen);
    cogMenu.setAttribute('aria-hidden', String(!cogMenuOpen));
    cogBtn.setAttribute('aria-expanded', String(cogMenuOpen));
}

// When opening the menu, move it out of any transformed stacking contexts by
// making it fixed to the viewport and positioning it near the cog button.
// When closing, restore the original absolute positioning so it behaves
// like before when hidden.
function openCogMenuAtButton() {
    if (!cogMenu || !cogBtn) return;
    // compute button rect
    const rect = cogBtn.getBoundingClientRect();
    const top = Math.round(rect.bottom + 8);
    const right = Math.round(window.innerWidth - rect.right);

    // preserve auto-sizing by not setting width; just fix position
    // create or reuse a full-viewport overlay that sits above everything
    // Force-create an overlay at body level and move the menu into it so the
    // menu is not constrained by ancestor stacking contexts (like map-controls).
    try {
        // create overlay if missing
        if (!document.getElementById('cog-overlay')) {
            const ov = document.createElement('div');
            ov.id = 'cog-overlay';
            ov.style.position = 'fixed';
            ov.style.top = '0';
            ov.style.left = '0';
            ov.style.width = '100%';
            ov.style.height = '100%';
            ov.style.pointerEvents = 'none';
            ov.style.zIndex = '2147483647';
            try { ov.style.setProperty('z-index','2147483647','important'); } catch(e){}
            document.body.appendChild(ov);
            _cogOverlay = ov;
        } else {
            _cogOverlay = document.getElementById('cog-overlay');
        }

        if (!_cogOriginalParent) {
            _cogOriginalParent = cogMenu.parentNode;
            _cogOriginalNextSibling = cogMenu.nextSibling;
        }

        // move the menu into the overlay (this actually changes its parent)
        if (_cogOverlay && cogMenu.parentNode !== _cogOverlay) {
            _cogOverlay.appendChild(cogMenu);
        }
        // allow clicks within the menu
        cogMenu.style.pointerEvents = 'auto';
    } catch (e) {
        // ignore
    }

    cogMenu.style.position = 'absolute';
    cogMenu.style.top = top + 'px';
    cogMenu.style.right = right + 'px';
    cogMenu.style.left = 'auto';
    // ensure it's visible above everything
    try {
        cogMenu.style.setProperty('z-index', '2147483647', 'important');
        cogMenu.style.setProperty('transform', 'none', 'important');
    } catch (e) {}
}

function restoreCogMenuPosition() {
    if (!cogMenu) return;
    // restore DOM position if we moved it
    try {
        if (_cogOriginalParent && cogMenu.parentNode !== _cogOriginalParent) {
            if (_cogOriginalNextSibling && _cogOriginalNextSibling.parentNode === _cogOriginalParent) {
                _cogOriginalParent.insertBefore(cogMenu, _cogOriginalNextSibling);
            } else {
                _cogOriginalParent.appendChild(cogMenu);
            }
        }
    } catch (e) {
        // ignore
    }

    cogMenu.style.position = '';
    cogMenu.style.top = '';
    cogMenu.style.right = '';
    cogMenu.style.left = '';
    try {
        cogMenu.style.removeProperty('z-index');
        cogMenu.style.removeProperty('position');
        cogMenu.style.removeProperty('transform');
    } catch (e) {}

    // remove overlay if present
    try {
        if (_cogOverlay) {
            // if overlay contains no other children, remove it
            if (_cogOverlay.childElementCount === 0) {
                _cogOverlay.parentNode.removeChild(_cogOverlay);
                _cogOverlay = null;
            } else if (!_cogOverlay.contains(cogMenu)) {
                _cogOverlay.parentNode.removeChild(_cogOverlay);
                _cogOverlay = null;
            }
        }
    } catch (e) {}
}

if (cogBtn && cogMenu) {
    cogBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newOpen = !cogMenuOpen;
        setCogMenu(newOpen);
        if (newOpen) {
            openCogMenuAtButton();
        } else {
            restoreCogMenuPosition();
        }
    });

    // Prevent clicks inside menu from closing it when handled locally
    cogMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (cogMenuOpen && !e.target.closest('#cog-menu') && !e.target.closest('#cog-btn')) {
            setCogMenu(false);
            restoreCogMenuPosition();
        }
    });

    // Close menu on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && cogMenuOpen) setCogMenu(false);
    });
}

// Hide back button on init
if (document.getElementById('back-btn')) {
    document.getElementById('back-btn').style.display = 'none';
}

let currentLevel = 'world';

// Create Layer Groups
const worldLayer = L.layerGroup();
const cityLayer = L.layerGroup();

// Add initial layer based on DEBUG setting
if (DEBUG_INITIAL_MAP === 'world') {
    worldLayer.addTo(map);
    currentLevel = 'world';
} else {
    cityLayer.addTo(map);
    currentLevel = 'city';
}

let activeCityTileLayer = null;
let activeDistrictLayer = null;
let currentMapTarget = '';
const mapInfoByTarget = new Map();

const getBackButtonLabel = () => {
    if (!currentMapTarget) {
        return '';
    }
    const currentInfo = mapInfoByTarget.get(currentMapTarget);
    const parentTarget = currentInfo?.parent;
    if (!parentTarget || parentTarget === 'world') {
        return '← Back to World Map';
    }
    return `← Back to ${mapInfoByTarget.get(parentTarget)?.name || 'Previous Area'}`;
};
const updateBackButton = () => {
    const backBtn = document.getElementById('back-btn');
    if (!currentMapTarget) {
        backBtn.style.display = 'none';
        return;
    }
    backBtn.style.display = 'block';
    backBtn.innerText = getBackButtonLabel();
};

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

function initializeIconVisibility(marker, getIconBounds) {
    marker._isActive = false;
    marker._isHovered = false;
    marker._searchMatch = false;
    let iconVisible = !HIDE_ICONS_BY_DEFAULT;

    const updateIconVisibility = (visible) => {
        const resolvedVisible = !HIDE_ICONS_BY_DEFAULT
            ? true
            : marker._isActive || marker._isHovered || marker._searchMatch || visible;
        iconVisible = visible;

        const markerEl = marker.getElement();
        if (!markerEl) return;

        markerEl.style.opacity = resolvedVisible ? '1' : '0';
        markerEl.style.display = resolvedVisible ? '' : 'none';
        markerEl.classList.toggle('is-active', marker._isActive);
    };

    marker._setActive = (isActive) => {
        marker._isActive = !!isActive;
        if (!isActive) marker._isHovered = false;
        updateIconVisibility(iconVisible);
    };

    marker._setHovered = (isHovered) => {
        marker._isHovered = !!isHovered;
        updateIconVisibility(iconVisible);
    };

    marker._refreshIconVisibility = () => {
        updateIconVisibility(iconVisible);
    };

    marker.on('add', () => {
        updateIconVisibility(iconVisible);
    });

    if (typeof getIconBounds === 'function') {
        const handleMouseMove = (e) => {
            if (!HIDE_ICONS_BY_DEFAULT) return;
            const point = map.mouseEventToContainerPoint(e.originalEvent);
            if (activeMarker === marker) {
                marker._setHovered(true);
                return;
            }
            marker._setHovered(getIconBounds(point));
        };

        const attachMouseMove = () => map.on('mousemove', handleMouseMove);
        const detachMouseMove = () => map.off('mousemove', handleMouseMove);

        marker.on('add', attachMouseMove);
        marker.on('remove', detachMouseMove);
    } else {
        marker.on('mouseover', () => {
            if (HIDE_ICONS_BY_DEFAULT) marker._setHovered(true);
        });
        marker.on('mouseout', () => {
            if (HIDE_ICONS_BY_DEFAULT) marker._setHovered(false);
        });
    }

    updateIconVisibility(iconVisible);
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
        interactive: true,
        draggable: false
    });

    initializeIconVisibility(marker);
    marker.on('click', () => {
        if (HIDE_ICONS_BY_DEFAULT) marker._setActive(true);
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
            const markerEl = marker.getElement();
            if (markerEl) {
                markerEl.classList.toggle('search-match', marker._searchMatch);
                if (marker._searchMatch) {
                    markerEl.style.visibility = 'visible';
                    markerEl.style.opacity = '1';
                    markerEl.style.display = 'block';
                }
            }
            if (typeof marker._refreshIconVisibility === 'function') {
                marker._refreshIconVisibility();
            }
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
    } else if (panelMode) {
        closePanelPopup();
    }
};

const stripJsonComments = (jsonText) => {
    return jsonText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
};

fetch('locations.json')
  .then(response => response.text())
  .then(text => {
      const data = JSON.parse(stripJsonComments(text));
      // Helper function to safely escape HTML and format newlines
      const escapeHtml = (text) => {
          return String(text || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
      };

      const formatDescription = (text) => {
          // Escape HTML special characters to prevent injection
          const escaped = escapeHtml(text || 'A notable location in Vordrasil.');
          // Replace \n with <br> for display
          return escaped.replace(/\n/g, '<br>');
      };

      const buildHighlightRegex = (query) => {
          const rawQuery = String(query || '').trim();
          if (!rawQuery) return null;
          const escaped = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(escaped, 'gi');
      };

      const highlightHtml = (html, query) => {
          const regex = buildHighlightRegex(query);
          if (!regex) return html;
          return html.replace(/([^<>]+)(?=<|$)/g, (text) =>
              text.replace(regex, '<span class="search-term">$&</span>')
          );
      };

      const normalizeTargetMap = (rawTargetMap) => {
          const trimmed = typeof rawTargetMap === 'string' ? rawTargetMap.trim() : '';
          return trimmed ? trimmed.replace(/\/{z}\/\{y}\/\{x}\.png$/i, '').replace(/\/$/, '') : '';
      };

      const registerMapHierarchy = (locations) => {
          Object.entries(locations).forEach(([name, location]) => {
              const rootTarget = normalizeTargetMap(location?.popupButton?.targetMap);
              if (rootTarget) {
                  mapInfoByTarget.set(rootTarget, { name, parent: 'world' });
              }

              if (Array.isArray(location.districts)) {
                  location.districts.forEach((district) => {
                      const districtTarget = normalizeTargetMap(district?.popupButton?.targetMap);
                      if (districtTarget) {
                          mapInfoByTarget.set(districtTarget, {
                              name: district.name,
                              parent: rootTarget || 'world'
                          });
                      }
                  });
              }
          });
      };

      const getCityScale = () => Math.pow(2, map.getZoom() - maxZoom);

      registerMapHierarchy(data);

      const createPopupContent = (title, description, popupButton, targetMap = '', notableCharacters = [], keyEvents = [], searchQuery = '') => {
          const rawTargetMap = typeof popupButton?.targetMap === 'string' ? popupButton.targetMap.trim() : '';
          const normalizedTargetMap = rawTargetMap
              ? rawTargetMap.replace(/\/{z}\/\{y}\/\{x}\.png$/i, '').replace(/\/$/, '')
              : '';
          const shouldShowButton = popupButton?.visible && normalizedTargetMap;
          const buttonText = escapeHtml(typeof popupButton?.text === 'string' ? popupButton.text : 'Enter City Map');
          const buttonHtml = shouldShowButton
              ? `<button onclick="loadCityMap('${normalizedTargetMap}')" class="popup-btn" ${popupButton.disabled ? 'disabled' : ''}>${buttonText}</button>`
              : '';

          const highlightedTitle = highlightHtml(escapeHtml(title), searchQuery);
          const highlightedDescription = highlightHtml(formatDescription(description), searchQuery);

          // Render notable characters section only when provided and non-empty
          let notableHtml = '';
          if (Array.isArray(notableCharacters) && notableCharacters.length) {
              const items = notableCharacters.map(c => {
                  const name = highlightHtml(escapeHtml(c.name || 'Unnamed'), searchQuery);
                  const desc = highlightHtml(formatDescription(c.description || ''), searchQuery);
                  return `<li><strong>${name}</strong><div class="char-desc">${desc}</div></li>`;
              }).join('');

              notableHtml = `
                  <div class="popup-separator" aria-hidden="true"></div>
                  <div class="popup-notable-characters">
                      <h3>Notable characters</h3>
                      <ul>${items}</ul>
                  </div>
              `;
          }

          let keyEventsHtml = '';
          if (Array.isArray(keyEvents) && keyEvents.length) {
              const items = keyEvents.map(c => {
                  const name = highlightHtml(escapeHtml(c.name || 'Unnamed Event'), searchQuery);
                  const desc = highlightHtml(formatDescription(c.description || ''), searchQuery);
                  return `<li><strong>${name}</strong><div class="event-desc">${desc}</div></li>`;
              }).join('');

              keyEventsHtml = `
                  <div class="popup-separator" aria-hidden="true"></div>
                  <div class="popup-key-events">
                      <h3>Key events</h3>
                      <ul>${items}</ul>
                  </div>
              `;
          }

          return `
              <div class="popup-content">
                  <div class="popup-main">
                      <h2>${highlightedTitle}</h2>
                      <p>${highlightedDescription}</p>
                      ${keyEventsHtml}
                      ${notableHtml}
                  </div>
                  <div class="popup-footer">
                      ${buttonHtml}
                  </div>
              </div>
          `;
      };

      const renderPanelPopup = (title, description, popupButton, targetMap = '', notableCharacters = [], keyEvents = []) => {
          if (!popupPanel) {
              return;
          }

          closePanelPopup();

          const contentHtml = createPopupContent(title, description, popupButton, targetMap, notableCharacters, keyEvents, searchInput?.value || '');
          popupPanel.innerHTML = `
              <div class="panel-header">
                  <button class="panel-close-btn" aria-label="Close popup panel">×</button>
              </div>
              <div class="panel-body">
                  ${contentHtml}
              </div>
          `;
          popupPanel.style.display = 'block';
          popupPanel.classList.add('open');
          popupPanel.setAttribute('aria-hidden', 'false');

          const closeButton = popupPanel.querySelector('.panel-close-btn');
          if (closeButton) {
              closeButton.addEventListener('click', (e) => {
                  e.stopPropagation();
                  closePanelPopup();
                  setActiveMarker(null);
                  if (searchInput) {
                      updateSearchHighlights(searchInput.value);
                  }
              });
          }
      };

      const handleMarkerPopup = (marker, title, description, popupButton, targetMap, notableCharacters, keyEvents) => {
          if (panelMode) {
              map.closePopup();
              renderPanelPopup(title, description, popupButton, targetMap, notableCharacters, keyEvents);
          }
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

              const getIconBounds = (point) => {
                  const locationPoint = map.latLngToContainerPoint([district.y, district.x]);
                  const scale = getCityScale();
                  const width = (district.width || 220) * scale;
                  const height = (district.height || 64) * scale;
                  const anchorX = Math.round(width / 2);
                  const anchorY = Math.round(height);

                  return point.x >= locationPoint.x - anchorX &&
                      point.x <= locationPoint.x + (width - anchorX) &&
                      point.y >= locationPoint.y - anchorY &&
                      point.y <= locationPoint.y + (height - anchorY);
              };

              initializeIconVisibility(districtMarker, getIconBounds);

              const districtPopupButton = district.popupButton || { visible: false, disabled: true, targetMap: '', text: 'Enter City Map' };
              const districtRawTarget = typeof districtPopupButton.targetMap === 'string' ? districtPopupButton.targetMap.trim() : '';
              const normalizedDistrictTarget = districtRawTarget
                  ? districtRawTarget.replace(/\/{z}\/\{y}\/\{x}\.png$/i, '').replace(/\/$/, '')
                  : '';
              if (normalizedDistrictTarget) {
                  mapInfoByTarget.set(normalizedDistrictTarget, { name: district.name, parent: popupTargetMap });
              }
              districtMarker.panelData = {
                  title: district.name,
                  description: district.description,
                  popupButton: districtPopupButton,
                  targetMap: popupTargetMap,
                  notableCharacters: district.notable_characters || [],
                  keyEvents: district.key_events || []
              };
              districtMarker.bindPopup(createPopupContent(
                  district.name,
                  district.description,
                  districtPopupButton,
                  popupTargetMap,
                  district.notable_characters || [],
                  district.key_events || [],
                  searchInput?.value || ''
              ));

              districtMarker._mapTarget = popupTargetMap;
              districtMarker._targetMap = normalizedDistrictTarget;
              districtMarker.searchText = buildSearchText(
                  district.name,
                  district.description,
                  district.notable_characters || [],
                  district.key_events || []
              );
              allMarkers.push(districtMarker);

              const updateDistrictScale = () => {
                  const scale = getCityScale();
                  districtMarker.setIcon(createLocationIcon({ ...district, name: district.name }, scale));
              reapplyMarkerSearchHighlight(districtMarker);
              };

              districtMarker.on('add', updateDistrictScale);
              map.on('zoomend', updateDistrictScale);
              districtMarker.on('remove', () => {
                  map.off('zoomend', updateDistrictScale);
              });

              districtMarker.on('click', () => {
                  justClickedMarker = true;
                  setActiveMarker(districtMarker);
                  if (panelMode) {
                      map.closePopup();
                      renderPanelPopup(
                          district.name,
                          district.description,
                          districtPopupButton,
                          popupTargetMap,
                          district.notable_characters || [],
                          district.key_events || []
                      );
                  }
              });
              districtMarker.on('popupopen', () => {
                  justClickedMarker = true;
                  setActiveMarker(districtMarker);
                  const popup = districtMarker.getPopup();
                  if (popup) {
                      popup.setContent(createPopupContent(
                          district.name,
                          district.description,
                          districtPopupButton,
                          popupTargetMap,
                          district.notable_characters || [],
                          district.key_events || [],
                          searchInput?.value || ''
                      ));
                  }
                  if (panelMode) {
                      map.closePopup();
                      renderPanelPopup(
                          district.name,
                          district.description,
                          districtPopupButton,
                          popupTargetMap,
                          district.notable_characters || [],
                          district.key_events || []
                      );
                  }
              });
              districtMarker.on('popupclose', () => {
                  if (activeMarker === districtMarker) {
                      setActiveMarker(null);
                  }
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

          const getIconBounds = (point) => {
              const locationPoint = map.latLngToContainerPoint([location.y, location.x]);
              const scale = getCityScale();
              const width = (location.width || 220) * scale;
              const height = (location.height || 64) * scale;
              const anchorX = Math.round(width / 2);
              const anchorY = Math.round(height);

              return point.x >= locationPoint.x - anchorX &&
                  point.x <= locationPoint.x + (width - anchorX) &&
                  point.y >= locationPoint.y - anchorY &&
                  point.y <= locationPoint.y + (height - anchorY);
          };

          initializeIconVisibility(marker, getIconBounds);
          marker.addTo(worldLayer);

          const updateMarkerScale = () => {
              const scale = getCityScale();
              marker.setIcon(createLocationIcon({ ...location, name }, scale));
              reapplyMarkerSearchHighlight(marker);
              if (typeof marker._refreshIconVisibility === 'function') {
                  marker._refreshIconVisibility();
              }
          };

          marker.on('add', updateMarkerScale);
          map.on('zoomend', updateMarkerScale);

          const popupButton = location.popupButton || { visible: false, disabled: true, targetMap: '', text: 'Enter City Map' };
          const rawTargetMap = typeof popupButton.targetMap === 'string' ? popupButton.targetMap.trim() : '';
          const normalizedTargetMap = rawTargetMap
              ? rawTargetMap.replace(/\/{z}\/{y}\/{x}\.png$/i, '').replace(/\/$/, '')
              : '';
          if (normalizedTargetMap) {
              mapInfoByTarget.set(normalizedTargetMap, { name, parent: 'world' });
          }
          marker.bindPopup(createPopupContent(
              name,
              location.description,
              popupButton,
              normalizedTargetMap,
              location.notable_characters || [],
              location.key_events || [],
              searchInput?.value || ''
          ));

          marker._mapTarget = 'world';
          marker._targetMap = normalizedTargetMap;
          marker.searchText = buildSearchText(
              name,
              location.description,
              location.notable_characters || [],
              location.key_events || []
          );
          allMarkers.push(marker);
          createDistrictLayer(location, normalizedTargetMap);

          marker.on('click', () => {
              justClickedMarker = true;
              setActiveMarker(marker);
              if (panelMode) {
                  map.closePopup();
                  renderPanelPopup(
                      name,
                      location.description,
                      popupButton,
                      normalizedTargetMap,
                      location.notable_characters || [],
                      location.key_events || []
                  );
              }
          });
          marker.on('popupopen', () => {
              justClickedMarker = true;
              setActiveMarker(marker);
              const popup = marker.getPopup();
              if (popup) {
                  popup.setContent(createPopupContent(
                      name,
                      location.description,
                      popupButton,
                      normalizedTargetMap,
                      location.notable_characters || [],
                      location.key_events || [],
                      searchInput?.value || ''
                  ));
              }
              if (panelMode) {
                  map.closePopup();
                  renderPanelPopup(
                      name,
                      location.description,
                      popupButton,
                      normalizedTargetMap,
                      location.notable_characters || [],
                      location.key_events || []
                  );
              }
          });
          marker.on('popupclose', () => {
              if (activeMarker === marker) {
                  setActiveMarker(null);
              }
          });
      });

      // DEBUG: Load initial map based on DEBUG_INITIAL_MAP setting
      if (DEBUG_INITIAL_MAP !== 'world') {
          const mapPath = `images/tiles_${DEBUG_INITIAL_MAP}`;
          loadCityMap(mapPath);
          console.log(`DEBUG: Loaded ${DEBUG_INITIAL_MAP} on init`);
      }
  })
  .catch(err => console.error("Could not load locations.json. Make sure to generate it first! ", err));

// ==========================================
// LEVEL 2: CITY MAP LAYER (Tiled)
// ==========================================

const createCityTileLayer = (tileFolder) => L.tileLayer(`${tileFolder}/{z}/{y}/{x}.png`, {
    minZoom: 0,
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
    closePanelPopup();
    setActiveMarker(null);

    if (activeCityTileLayer) {
        cityLayer.removeLayer(activeCityTileLayer);
    }

    currentMapTarget = normalizedTargetMap;

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
    updateBackButton();
}

function handleBackNavigation() {
    map.closePopup();

    if (!currentMapTarget) {
        return;
    }

    const parentTarget = mapInfoByTarget.get(currentMapTarget)?.parent;
    if (!parentTarget || parentTarget === 'world') {
        setActiveMarker(null);
        closePanelPopup();
        if (activeDistrictLayer) {
            cityLayer.removeLayer(activeDistrictLayer);
            activeDistrictLayer = null;
        }
        if (activeCityTileLayer) {
            cityLayer.removeLayer(activeCityTileLayer);
            activeCityTileLayer = null;
        }
        map.removeLayer(cityLayer);
        map.addLayer(worldLayer);
        currentLevel = 'world';
        currentMapTarget = '';
        currentMapLabel = '';
        map.fitBounds(mapBounds);
        updateBackButton();
        return;
    }

    closePanelPopup();
    loadCityMap(parentTarget);
}


// ==========================================
// DEVELOPER TOOL: COORDINATE FINDER
// ==========================================
const developerPopup = L.popup();
function onMapClick(e) {
    const target = e.originalEvent?.target;

    if (target && target.closest && (target.closest('.location-marker-wrap, .elevating-city-marker, .marker-container') || target.closest('#popup-panel') || target.closest('#panel-toggle-btn'))) {
        return;
    }

    if (activeMarker) {
        setActiveMarker(null);
    }

    if (panelMode) {
        closePanelPopup();
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