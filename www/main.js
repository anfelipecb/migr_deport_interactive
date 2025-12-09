// Global variables
console.log("main.js loaded!");
let map;
let particles = [];
let animationActive = false;
let animationFrameId;
let canvas;
let ctx;
let worldCountriesData = null;
let countryTooltip = null;
let hoveredCountryName = null;
let selectedCountryName = null; // Track clicked/selected country for particle filtering

// Configuration
const SPEED_FACTOR = 0.0009; // 20x faster - trip takes ~5 seconds
const PARTICLE_RADIUS = 1.8; // Reduced size for many particles
const PARTICLE_COLOR = '#FF000080';
const DEFAULT_CAMERA = {
    center: [-85, 20],
    zoom: 2.5,
    pitch: 0,
    bearing: 0
};

const WORLD_CAMERA = {
    center: [0, 20],
    zoom: 1.8,
    pitch: 0,
    bearing: 0
};
const DESTINATION_SOURCE_ID = 'destination-totals';
const DESTINATION_CIRCLE_LAYER_ID = 'destination-circles';
const DESTINATION_LABEL_LAYER_ID = 'destination-labels';
const COUNTRIES_SOURCE_ID = 'world-countries';
const COUNTRIES_LAYER_ID = 'country-fills';
const COUNTRIES_OUTLINE_LAYER_ID = 'country-outlines';

// Mapping from Natural Earth country names to our destination names
const COUNTRY_NAME_MAPPING = {
    'Mexico': 'Mexico',
    'Honduras': 'Honduras',
    'Guatemala': 'Guatemala',
    'El Salvador': 'El Salvador',
    'Nicaragua': 'Nicaragua',
    'Haiti': 'Haiti',
    'Dominican Republic': 'Dominican Republic',
    'Jamaica': 'Jamaica',
    'Colombia': 'Colombia',
    'Ecuador': 'Ecuador',
    'Peru': 'Peru',
    'Brazil': 'Brazil',
    'Venezuela': 'Venezuela',
    'Cuba': 'Cuba',
    'India': 'India',
    'China': 'China',
    'Philippines': 'Philippines',
    'Vietnam': 'Vietnam',
    // Add more as needed
};

let topDestinations = [];
let allFlows = []; // Store all flows for country aggregation
let countryRemovalData = {}; // Cache of aggregated removal data by country
let overlayActive = false;
let countriesActive = false;
let destinationTooltip = null;

async function loadData() {
    try {
        const response = await fetch('data/flow_data.json');
        const allFlows = await response.json();

        // Filter out flows with missing coordinates
        const flows = allFlows.filter(f =>
            f.origin && f.origin.lat && f.origin.lon &&
            f.destination && f.destination.lat && f.destination.lon
        );

        console.log(`Loaded ${flows.length} flows (from ${allFlows.length} total)`);
        return flows;
    } catch (error) {
        console.error("Error loading data:", error);
        return [];
    }
}

async function loadTopDestinations() {
    try {
        const response = await fetch('data/top_destinations.json');
        const data = await response.json();
        return data.destinations || [];
    } catch (error) {
        console.error('Error loading top destinations:', error);
        return [];
    }
}

function createParticles(flows) {
    const particles = [];

    flows.forEach((flow, flowIndex) => {
        if (!flow.origin.lat || !flow.origin.lon || !flow.destination.lat || !flow.destination.lon) {
            return;
        }

        const start = [flow.origin.lon, flow.origin.lat];
        const end = [flow.destination.lon, flow.destination.lat];

        // Skip if origin is same as destination
        if (flow.origin.lat === flow.destination.lat && flow.origin.lon === flow.destination.lon) {
            return;
        }

        const distance = turf.distance(start, end);
        if (distance < 1) return;

        const line = turf.greatCircle(turf.point(start), turf.point(end), { npoints: 100 });
        
        const speed = SPEED_FACTOR;
        
        // Create multiple particles per flow based on scaled_count
        const numParticles = flow.scaled_count || 1;
        
        for (let i = 0; i < numParticles; i++) {
            // Progressive animation: stagger start times
            // Each particle starts at a different offset (0 to 1)
            // This offset represents a delay before the particle first appears
            const startOffset = Math.random();
            
            particles.push({
                line: line,
                distance: distance,
                progress: 0, // Start at 0, will only appear when progress >= startOffset
                speed: speed,
                startOffset: startOffset,
                flowIndex: flowIndex,
                particleIndex: i,
                destinationName: flow.destination.name,
                filtered: false,
                opacity: 1.0,
                color: 'red' // Default color: red for matching, gray for non-matching
            });
        }
    });

    console.log(`Created ${particles.length} particles from ${flows.length} flows`);
    return particles;
}

function populateDestinationCards(destinations) {
    const cards = document.querySelectorAll('.destination-step');
    cards.forEach((card, index) => {
        const dest = destinations[index];
        if (!dest) {
            card.style.display = 'none';
            return;
        }
        const titleEl = card.querySelector('.dest-title');
        const summaryEl = card.querySelector('.dest-summary');
        const listEl = card.querySelector('.dest-origins');
        if (titleEl) {
            titleEl.textContent = `${dest.destination}`;
        }
        if (summaryEl) {
            summaryEl.textContent = `${dest.total.toLocaleString()} removals since September 2023`;
        }
        if (listEl) {
            listEl.innerHTML = '';
            dest.top_origins.forEach(origin => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${origin.name}</span><span>${origin.count.toLocaleString()} (${origin.percent}%)</span>`;
                listEl.appendChild(li);
            });
        }
    });
}

function drawParticles() {
    if (!animationActive || !canvas || !ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update and draw each particle
    particles.forEach(p => {
        // Increment progress for all particles continuously
        p.progress += p.speed;
        
        // Reset particle when it completes the journey (creates continuous loop)
        // Reset to startOffset so particle immediately reappears at origin
        if (p.progress >= 1) {
            p.progress = p.startOffset;
        }
        
        // Progressive animation: particle only visible when progress has passed its start offset
        // Particles with startOffset=0 appear immediately, others appear progressively as progress increases
        if (p.progress >= p.startOffset) {
            try {
                // Calculate position along path
                // Map progress from [startOffset, 1] to [0, 1] for path calculation
                const normalizedProgress = (p.progress - p.startOffset) / (1 - p.startOffset);
                const currentDist = p.distance * normalizedProgress;
                const point = turf.along(p.line, currentDist);
                const coords = point.geometry.coordinates; // [lon, lat]

                // Convert geographic coordinates to pixel coordinates
                const pixel = map.project(coords);

                // Draw particle as circle with dynamic color and opacity
                ctx.beginPath();
                ctx.arc(pixel.x, pixel.y, PARTICLE_RADIUS, 0, Math.PI * 2);
                const baseOpacity = 0.5; // Base opacity
                const finalOpacity = baseOpacity * (p.opacity || 1.0);
                
                // Use particle color: red for matching destination, gray for non-matching
                if (p.color === 'gray') {
                    ctx.fillStyle = `rgba(128, 128, 128, ${finalOpacity})`; // Gray
                } else {
                    ctx.fillStyle = `rgba(255, 0, 0, ${finalOpacity})`; // Red
                }
                ctx.fill();
            } catch (error) {
                // Skip particles that cause errors (e.g., invalid coordinates)
            }
        }
        // If progress < startOffset, particle is not yet visible (waiting to start)
    });

    animationFrameId = requestAnimationFrame(drawParticles);
}

function createCanvasOverlay() {
    // Create canvas element
    canvas = document.createElement('canvas');
    canvas.id = 'particle-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1';
    
    // Get map container and append canvas
    const mapContainer = document.getElementById('map');
    mapContainer.appendChild(canvas);
    
    // Set canvas size to match map container
    canvas.width = mapContainer.offsetWidth;
    canvas.height = mapContainer.offsetHeight;
    
    // Get 2D context
    ctx = canvas.getContext('2d');
    
    console.log('Canvas overlay created:', canvas.width, 'x', canvas.height);
}

function resizeCanvas() {
    if (!canvas) return;
    const mapContainer = document.getElementById('map');
    canvas.width = mapContainer.offsetWidth;
    canvas.height = mapContainer.offsetHeight;
}

function disableMapInteractions() {
    if (!map) return;
    map.dragPan.disable();
    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
    map.keyboard.disable();
}

function enableMapInteractions() {
    if (!map) return;
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
    map.keyboard.enable();
}

function flyToDefault() {
    if (!map) return;
    map.flyTo({
        center: DEFAULT_CAMERA.center,
        zoom: DEFAULT_CAMERA.zoom,
        pitch: DEFAULT_CAMERA.pitch,
        bearing: DEFAULT_CAMERA.bearing,
        speed: 0.6
    });
}

function flyToWorld() {
    if (!map) return;
    map.flyTo({
        center: WORLD_CAMERA.center,
        zoom: WORLD_CAMERA.zoom,
        pitch: WORLD_CAMERA.pitch,
        bearing: WORLD_CAMERA.bearing,
        speed: 0.6
    });
}

function focusOnDestination(index) {
    if (!map || !topDestinations[index]) return;
    const dest = topDestinations[index];
    const cam = dest.camera;
    map.flyTo({
        center: [cam.center.lon, cam.center.lat],
        zoom: cam.zoom,
        pitch: cam.pitch,
        bearing: cam.bearing,
        speed: 0.8
    });
    setDestinationOverlayVisible(false);
    disableMapInteractions();
}

function buildDestinationGeoJSON(flows) {
    const totals = {};
    flows.forEach(flow => {
        const destName = flow.destination.name;
        if (!totals[destName]) {
            totals[destName] = {
                name: destName,
                total: 0,
                lat: flow.destination.lat,
                lon: flow.destination.lon
            };
        }
        totals[destName].total += flow.count || 0;
    });
    
    return {
        type: 'FeatureCollection',
        features: Object.values(totals).map(info => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [info.lon, info.lat]
            },
            properties: {
                name: info.name,
                total: info.total
            }
        }))
    };
}

function addDestinationOverlay(geojson) {
    if (!map) return;
    if (map.getSource(DESTINATION_SOURCE_ID)) {
        map.getSource(DESTINATION_SOURCE_ID).setData(geojson);
        return;
    }
    
    map.addSource(DESTINATION_SOURCE_ID, {
        type: 'geojson',
        data: geojson
    });
    
    map.addLayer({
        id: DESTINATION_CIRCLE_LAYER_ID,
        type: 'circle',
        source: DESTINATION_SOURCE_ID,
        paint: {
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['get', 'total'],
                1000, 6,
                20000, 12,
                100000, 18
            ],
            'circle-color': '#FF6B6B',
            'circle-opacity': 0.7,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1
        }
    });
    
    map.addLayer({
        id: DESTINATION_LABEL_LAYER_ID,
        type: 'symbol',
        source: DESTINATION_SOURCE_ID,
        layout: {
            'text-field': ['get', 'name'],
            'text-offset': [0, 1.2],
            'text-size': 12,
            'text-anchor': 'top'
        },
        paint: {
            'text-color': '#333',
            'text-halo-color': '#fff',
            'text-halo-width': 1
        }
    });
    
    map.setLayoutProperty(DESTINATION_CIRCLE_LAYER_ID, 'visibility', 'none');
    map.setLayoutProperty(DESTINATION_LABEL_LAYER_ID, 'visibility', 'none');
    
    map.on('mousemove', DESTINATION_CIRCLE_LAYER_ID, (e) => {
        if (!overlayActive || !destinationTooltip) return;
        const feature = e.features[0];
        map.getCanvas().style.cursor = 'pointer';
        destinationTooltip.style.display = 'block';
        destinationTooltip.style.left = `${e.point.x + 15}px`;
        destinationTooltip.style.top = `${e.point.y + 15}px`;
        destinationTooltip.innerHTML = `<strong>${feature.properties.name}</strong><br>${Number(feature.properties.total).toLocaleString()} removals`;
    });
    
    map.on('mouseleave', DESTINATION_CIRCLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
        if (destinationTooltip) destinationTooltip.style.display = 'none';
    });
    
    map.on('click', DESTINATION_CIRCLE_LAYER_ID, (e) => {
        if (!overlayActive) return;
        const feature = e.features[0];
        if (!feature) return;
        map.flyTo({
            center: feature.geometry.coordinates,
            zoom: 5,
            pitch: 35,
            speed: 0.8
        });
    });
}

function setDestinationOverlayVisible(visible) {
    overlayActive = visible;
    if (!map || !map.getLayer(DESTINATION_CIRCLE_LAYER_ID)) return;
    const visibility = visible ? 'visible' : 'none';
    map.setLayoutProperty(DESTINATION_CIRCLE_LAYER_ID, 'visibility', visibility);
    map.setLayoutProperty(DESTINATION_LABEL_LAYER_ID, 'visibility', visibility);
    if (!visible && destinationTooltip) {
        destinationTooltip.style.display = 'none';
    }
}

async function loadWorldCountries() {
    try {
        // Try using a GeoJSON source that handles dateline crossings better
        // Using Natural Earth data converted to GeoJSON
        const response = await fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json');
        let geojson = await response.json();
        
        // If that source doesn't work, fall back to TopoJSON with fixes
        if (!geojson || !geojson.features || geojson.features.length === 0) {
            console.log('Primary source failed, trying TopoJSON fallback...');
            const topoResponse = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
            const topology = await topoResponse.json();
            geojson = topojson.feature(topology, topology.objects.countries);
        }
        
        // Post-process to fix any geometry issues, especially for Russia
        if (geojson && geojson.features) {
            geojson.features.forEach(feature => {
                if (!feature.geometry || !feature.geometry.coordinates) return;
                
                // Check if this is Russia
                const isRussia = feature.properties?.name?.toLowerCase().includes('russia') || 
                               feature.properties?.NAME?.toLowerCase().includes('russia');
                
                if (isRussia) {
                    console.log('Processing Russia geometry:', feature.geometry.type);
                    
                    // For Russia, ensure coordinates are properly structured
                    // MapLibre should handle MultiPolygon correctly, but we can validate
                    if (feature.geometry.type === 'MultiPolygon') {
                        // Ensure all polygons have valid coordinates
                        feature.geometry.coordinates = feature.geometry.coordinates.filter(polygon => 
                            polygon && polygon.length > 0
                        );
                    }
                }
            });
        }
        
        console.log('Loaded world countries:', geojson.features?.length || 0, 'countries');
        const russiaFeature = geojson.features?.find(f => 
            f.properties?.name?.toLowerCase().includes('russia') ||
            f.properties?.NAME?.toLowerCase().includes('russia')
        );
        if (russiaFeature) {
            console.log('Russia found:', russiaFeature.properties?.name || russiaFeature.properties?.NAME, 
                       'Type:', russiaFeature.geometry?.type);
        }
        
        return geojson;
    } catch (error) {
        console.error('Error loading world countries:', error);
        return null;
    }
}

function aggregateFlowsByDestination(flows) {
    const aggregated = {};
    
    flows.forEach(flow => {
        if (!flow.destination || !flow.destination.name) return;
        
        const destName = flow.destination.name;
        
        if (!aggregated[destName]) {
            aggregated[destName] = {
                destination: destName,
                total: 0,
                origins: {}
            };
        }
        
        aggregated[destName].total += flow.count || 0;
        
        // Track origin states
        if (flow.origin && flow.origin.name) {
            const originName = flow.origin.name;
            if (!aggregated[destName].origins[originName]) {
                aggregated[destName].origins[originName] = 0;
            }
            aggregated[destName].origins[originName] += flow.count || 0;
        }
    });
    
    // Convert origins to sorted array
    Object.keys(aggregated).forEach(dest => {
        const origins = aggregated[dest].origins;
        aggregated[dest].top_origins = Object.keys(origins)
            .map(name => ({
                name: name,
                count: origins[name],
                percent: ((origins[name] / aggregated[dest].total) * 100).toFixed(1)
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Top 5
    });
    
    return aggregated;
}

function normalizeCountryName(name) {
    // Remove common prefixes/suffixes and normalize
    return name
        .toLowerCase()
        .replace(/^the\s+/, '') // Remove "The"
        .replace(/\s+of\s+america$/, '') // Remove "of America"
        .replace(/\s+and\s+/g, ' & ') // Normalize "and"
        .trim();
}

function getDestinationDataForCountry(countryName) {
    // First try exact match
    if (countryRemovalData[countryName]) {
        return countryRemovalData[countryName];
    }
    
    // Try mapped name
    const mappedName = COUNTRY_NAME_MAPPING[countryName];
    if (mappedName && countryRemovalData[mappedName]) {
        return countryRemovalData[mappedName];
    }
    
    // Try case-insensitive match
    const lowerCountryName = countryName.toLowerCase();
    for (const destName in countryRemovalData) {
        if (destName.toLowerCase() === lowerCountryName) {
            return countryRemovalData[destName];
        }
    }
    
    // Try normalized match (handles variations)
    const normalizedCountryName = normalizeCountryName(countryName);
    for (const destName in countryRemovalData) {
        const normalizedDestName = normalizeCountryName(destName);
        if (normalizedDestName === normalizedCountryName) {
            return countryRemovalData[destName];
        }
    }
    
    // Try reverse mapping (find Natural Earth name that maps to our destination)
    for (const [neName, ourName] of Object.entries(COUNTRY_NAME_MAPPING)) {
        if (neName === countryName && countryRemovalData[ourName]) {
            return countryRemovalData[ourName];
        }
    }
    
    // Try partial match (e.g., "United States" matches "United States of America")
    for (const destName in countryRemovalData) {
        const normalizedDest = normalizeCountryName(destName);
        const normalizedCountry = normalizeCountryName(countryName);
        if (normalizedDest.includes(normalizedCountry) || normalizedCountry.includes(normalizedDest)) {
            return countryRemovalData[destName];
        }
    }
    
    // Last resort: try matching first word (e.g., "Dominican" matches "Dominican Republic")
    // Only if the first word is substantial (at least 5 chars)
    // Exclude "united" as it's too ambiguous (matches both United States and United Kingdom)
    const firstWord = countryName.split(/\s+/)[0].toLowerCase();
    if (firstWord.length >= 5 && firstWord !== 'united') {
        for (const destName in countryRemovalData) {
            if (destName.toLowerCase().startsWith(firstWord)) {
                return countryRemovalData[destName];
            }
        }
    }
    
    // Special handling for "United" countries - require more specific matching
    if (firstWord === 'united') {
        const normalizedCountry = normalizeCountryName(countryName);
        // Only match if the normalized names are very similar (not just sharing "united")
        for (const destName in countryRemovalData) {
            const normalizedDest = normalizeCountryName(destName);
            // Require at least the second word to match as well
            const countryWords = normalizedCountry.split(/\s+/);
            const destWords = normalizedDest.split(/\s+/);
            if (countryWords.length > 1 && destWords.length > 1) {
                // Check if second words match (e.g., "states" matches "states", "kingdom" matches "kingdom")
                if (countryWords[1] === destWords[1] && countryWords[1].length >= 4) {
                    return countryRemovalData[destName];
                }
            }
        }
    }
    
    return null;
}

function addCountryLayers(geojson) {
    if (!map || !geojson) return;
    
    // Add source with promoteId to use 'name' property as feature ID for feature-state
    map.addSource(COUNTRIES_SOURCE_ID, {
        type: 'geojson',
        data: geojson,
        promoteId: 'name'
    });
    
    // Add fill layer for countries
    // Try to add before circles layer, but if it doesn't exist, add to end
    const beforeLayer = map.getLayer(DESTINATION_CIRCLE_LAYER_ID) 
        ? DESTINATION_CIRCLE_LAYER_ID 
        : undefined;
    
    map.addLayer({
        id: COUNTRIES_LAYER_ID,
        type: 'fill',
        source: COUNTRIES_SOURCE_ID,
        paint: {
            'fill-color': [
                'case',
                ['boolean', ['feature-state', 'isDestination'], false],
                '#f0f0f0',  // Light gray for destination countries
                '#ffcccc'   // Light red for non-destination countries
            ],
            'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                0.8,  // Higher opacity on hover
                ['boolean', ['feature-state', 'isDestination'], false],
                0.3,  // Medium opacity for destinations
                0.1   // Low opacity for non-destinations
            ],
            'fill-antialias': true
        }
    }, beforeLayer);
    
    // Add outline layer
    map.addLayer({
        id: COUNTRIES_OUTLINE_LAYER_ID,
        type: 'line',
        source: COUNTRIES_SOURCE_ID,
        paint: {
            'line-color': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                '#ff0000',  // Red border on hover
                '#cccccc'   // Light gray border normally
            ],
            'line-width': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                2,  // Thicker on hover
                0.5
            ]
        }
    }, beforeLayer);
    
    // Initially hide country layers
    map.setLayoutProperty(COUNTRIES_LAYER_ID, 'visibility', 'none');
    map.setLayoutProperty(COUNTRIES_OUTLINE_LAYER_ID, 'visibility', 'none');
    
    // Mark destination countries
    markDestinationCountries();
    
    setupCountryInteractions();
}

function markDestinationCountries() {
    if (!map) return;
    
    // Mark all countries that have removal data
    // We need to match Natural Earth country names with our destination names
    const features = worldCountriesData?.features || [];
    let markedCount = 0;
    
    features.forEach(feature => {
        const neCountryName = feature.properties.name;
        const destData = getDestinationDataForCountry(neCountryName);
        
        if (destData) {
            map.setFeatureState(
                { source: COUNTRIES_SOURCE_ID, id: neCountryName },
                { isDestination: true }
            );
            markedCount++;
        }
    });
    
    console.log(`Marked ${markedCount} countries as destinations`);
}

function setupCountryInteractions() {
    if (!map) {
        console.error('Cannot setup country interactions: map not initialized');
        return;
    }
    
    console.log('Setting up country interactions for layer:', COUNTRIES_LAYER_ID);
    
    // Create tooltip div if it doesn't exist
    if (!countryTooltip) {
        countryTooltip = document.createElement('div');
        countryTooltip.className = 'country-tooltip';
        countryTooltip.style.position = 'absolute';
        countryTooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        countryTooltip.style.color = '#fff';
        countryTooltip.style.padding = '10px 15px';
        countryTooltip.style.borderRadius = '6px';
        countryTooltip.style.fontSize = '14px';
        countryTooltip.style.pointerEvents = 'none';
        countryTooltip.style.opacity = '0';
        countryTooltip.style.zIndex = '1000';
        countryTooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        countryTooltip.style.transition = 'opacity 0.2s';
        document.getElementById('map').appendChild(countryTooltip);
    }
    
    // Mouse move handler
    map.on('mousemove', COUNTRIES_LAYER_ID, (e) => {
        if (!countriesActive) {
            console.log('Country hover blocked: countriesActive =', countriesActive);
            return;
        }
        if (e.features.length === 0) return;
        
        map.getCanvas().style.cursor = 'pointer';
        const feature = e.features[0];
        const countryName = feature.properties.name;
        
        // Update hover state
        if (hoveredCountryName !== null && hoveredCountryName !== countryName) {
            map.setFeatureState(
                { source: COUNTRIES_SOURCE_ID, id: hoveredCountryName },
                { hover: false }
            );
        }
        
        hoveredCountryName = countryName;
        map.setFeatureState(
            { source: COUNTRIES_SOURCE_ID, id: countryName },
            { hover: true }
        );
        
        // Get destination data for this country
        const destData = getDestinationDataForCountry(countryName);
        
        if (destData) {
            // Show tooltip with data
            let tooltipHTML = `<strong>${destData.destination}</strong><br/>`;
            tooltipHTML += `Total: ${destData.total.toLocaleString()} removals<br/>`;
            if (destData.top_origins && destData.top_origins.length > 0) {
                tooltipHTML += `<br/><strong>Top Origin States:</strong><br/>`;
                destData.top_origins.forEach((origin, i) => {
                    tooltipHTML += `${i + 1}. ${origin.name}: ${origin.count.toLocaleString()} (${origin.percent}%)<br/>`;
                });
            }
            
            countryTooltip.innerHTML = tooltipHTML;
            countryTooltip.style.left = `${e.point.x + 15}px`;
            countryTooltip.style.top = `${e.point.y + 15}px`;
            countryTooltip.style.opacity = '1';
            
            // Filter particles to only show flows to this country
            filterParticlesByDestination(destData.destination);
        } else {
            // Debug: log available countries
            console.log(`No data found for country: "${countryName}"`);
            console.log('Available destinations:', Object.keys(countryRemovalData).slice(0, 10));
            
            // No data for this country
            countryTooltip.innerHTML = `<strong>${countryName}</strong><br/>No removal data`;
            countryTooltip.style.left = `${e.point.x + 15}px`;
            countryTooltip.style.top = `${e.point.y + 15}px`;
            countryTooltip.style.opacity = '1';
            
            // Fade all particles
            filterParticlesByDestination(null);
        }
    });
    
    // Mouse leave handler
    map.on('mouseleave', COUNTRIES_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
        
        if (hoveredCountryName !== null) {
            map.setFeatureState(
                { source: COUNTRIES_SOURCE_ID, id: hoveredCountryName },
                { hover: false }
            );
            hoveredCountryName = null;
        }
        
        if (countryTooltip) {
            countryTooltip.style.opacity = '0';
        }
        
        // Only restore particles if no country is selected (clicked)
        // If a country was clicked, maintain the filter
        if (selectedCountryName === null || selectedCountryName === undefined) {
            filterParticlesByDestination(undefined);
        } else {
            // Maintain the selected country filter
            filterParticlesByDestination(selectedCountryName);
        }
    });
    
    // Click handler for countries
    map.on('click', COUNTRIES_LAYER_ID, (e) => {
        if (!countriesActive || e.features.length === 0) return;
        
        const feature = e.features[0];
        const countryName = feature.properties.name;
        const destData = getDestinationDataForCountry(countryName);
        
        if (destData) {
            // Filter particles to show only flows to this country (persist on click)
            filterParticlesByDestination(destData.destination);
            
            // Zoom to the country
            const bbox = turf.bbox(feature.geometry);
            map.fitBounds(bbox, {
                padding: 100,
                maxZoom: 5,
                duration: 1000
            });
            
            // Keep the tooltip visible with the country data
            console.log(`Clicked on ${countryName}: ${destData.total.toLocaleString()} removals`);
        } else {
            // No data for this country - gray out all particles
            filterParticlesByDestination(null);
        }
    });
    
    console.log('Country interactions setup complete');
}

function filterParticlesByDestination(destinationName) {
    if (!canvas || !ctx || particles.length === 0) return;
    
    // Store selected country for click persistence
    selectedCountryName = destinationName;
    
    // Store filter state on each particle
    particles.forEach(p => {
        if (destinationName === undefined) {
            // Restore all particles (undefined means no filter)
            p.filtered = false;
            p.opacity = 1.0;
            p.color = 'red'; // All particles red when no filter
        } else if (destinationName === null) {
            // Fade all particles (null means no match)
            p.filtered = true;
            p.opacity = 0.2;
            p.color = 'gray'; // All particles gray when no data
        } else {
            // Filter based on destination
            p.filtered = p.destinationName !== destinationName;
            p.opacity = p.filtered ? 0.5 : 1.0; // Keep some visibility for gray particles
            p.color = p.filtered ? 'gray' : 'red'; // Gray for non-matching, red for matching
        }
    });
}

function setCountryLayersVisible(visible) {
    countriesActive = visible;
    if (!map || !map.getLayer(COUNTRIES_LAYER_ID)) {
        console.warn('Country layers not yet loaded');
        return;
    }
    const visibility = visible ? 'visible' : 'none';
    map.setLayoutProperty(COUNTRIES_LAYER_ID, 'visibility', visibility);
    map.setLayoutProperty(COUNTRIES_OUTLINE_LAYER_ID, 'visibility', visibility);
    console.log(`Country layers visibility set to: ${visibility}, countriesActive: ${countriesActive}`);
}

function initMap() {
    map = new maplibregl.Map({
        container: 'map',
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        center: DEFAULT_CAMERA.center,
        zoom: DEFAULT_CAMERA.zoom,
        pitch: DEFAULT_CAMERA.pitch,
        bearing: DEFAULT_CAMERA.bearing,
        interactive: true
    });

    map.on('load', async () => {
        console.log("Map loaded");

        destinationTooltip = document.createElement('div');
        destinationTooltip.className = 'map-tooltip';
        destinationTooltip.style.display = 'none';
        document.getElementById('map').appendChild(destinationTooltip);

        // Create canvas overlay
        createCanvasOverlay();

        // Load flows
        const flows = await loadData();
        allFlows = flows; // Store for country aggregation
        particles = createParticles(flows);

        // Aggregate flows by destination country
        countryRemovalData = aggregateFlowsByDestination(flows);
        console.log(`Aggregated removal data for ${Object.keys(countryRemovalData).length} destination countries`);
        console.log('Sample destinations:', Object.keys(countryRemovalData).slice(0, 10));

        const destinationGeoJSON = buildDestinationGeoJSON(flows);
        addDestinationOverlay(destinationGeoJSON);
        setDestinationOverlayVisible(false);
        
        // Load and add world countries
        worldCountriesData = await loadWorldCountries();
        if (worldCountriesData) {
            addCountryLayers(worldCountriesData);
            console.log('Country layers added. Layer exists:', map.getLayer(COUNTRIES_LAYER_ID) !== undefined);
        } else {
            console.error('Failed to load world countries data');
        }
        
        disableMapInteractions();

        // Debug: Log summary statistics
        if (flows.length > 0) {
            console.log(`Loaded ${flows.length} flows with ${particles.length} total particles`);
            const totalDeportations = flows.reduce((sum, f) => sum + (f.count || 0), 0);
            console.log(`Total deportations represented: ${totalDeportations.toLocaleString()}`);
        }
    });

    // Handle window resize
    map.on('resize', () => {
        resizeCanvas();
    });
}

// Scrollytelling Setup
const scroller = scrollama();

function handleStepEnter(response) {
    document.querySelectorAll('.step').forEach(step => step.classList.remove('is-active'));
    response.element.classList.add('is-active');

    console.log(`DEBUG: Entered step ${response.index}`);

    switch (response.index) {
        case 0:
            // Start animation
            if (!animationActive) {
                animationActive = true;
                console.log('Starting animation');
                drawParticles();
            }
            flyToDefault();
            setDestinationOverlayVisible(false);
            setCountryLayersVisible(false);
            disableMapInteractions();
            break;
        case 1:
        case 2:
        case 3:
            focusOnDestination(response.index - 1);
            setCountryLayersVisible(true);
            break;
        case 4:
            console.log('Step 4: Interactive exploration');
            flyToWorld(); // Show whole world for exploration
            setDestinationOverlayVisible(false); // Hide circles, use countries instead
            
            // Reset particle filter - all particles should be red initially
            selectedCountryName = null;
            filterParticlesByDestination(undefined);
            
            // Ensure country layers are visible
            setTimeout(() => {
                setCountryLayersVisible(true);
                console.log('Country layers should now be visible');
                console.log('countriesActive:', countriesActive);
                console.log('Layer exists:', map && map.getLayer(COUNTRIES_LAYER_ID));
            }, 100);
            
            enableMapInteractions();
            break;
    }
}

function handleStepExit(response) {
    // Check if we're exiting the last step (interactive-step, index 4)
    if (response.index === 4 && response.direction === 'down') {
        console.log('Exiting last step - triggering exit animation');
        
        // Add exit class to article for CSS transitions
        const article = document.querySelector('#scrolly article');
        if (article) {
            article.classList.add('exiting');
        }
        
        // Recenter and reset zoom to default
        setTimeout(() => {
            flyToDefault();
            // Fade out cards
            document.querySelectorAll('#scrolly article .step').forEach(step => {
                step.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
                step.style.opacity = '0';
                step.style.transform = 'translateY(-20px)';
            });
        }, 100);
    }
}

async function init() {
    topDestinations = await loadTopDestinations();
    populateDestinationCards(topDestinations);
    
    initMap();

    scroller
        .setup({
            step: '#scrolly article .step',
            offset: 0.5,
            debug: false
        })
        .onStepEnter(handleStepEnter)
        .onStepExit(handleStepExit);

    window.addEventListener('resize', () => {
        scroller.resize();
        resizeCanvas();
    });
}

// Start
init();
