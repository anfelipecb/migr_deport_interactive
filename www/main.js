// Global variables
console.log("main.js loaded!");
let map;
let particles = [];
let animationActive = false;
let animationFrameId;
let canvas;
let ctx;

// Configuration
const SPEED_FACTOR = 0.0004; // 20x faster - trip takes ~5 seconds
const PARTICLE_RADIUS = 2; // Reduced size for many particles
const PARTICLE_COLOR = '#FF000080';
const DEFAULT_CAMERA = {
    center: [-85, 20],
    zoom: 2.5,
    pitch: 0,
    bearing: 0
};
const DESTINATION_SOURCE_ID = 'destination-totals';
const DESTINATION_CIRCLE_LAYER_ID = 'destination-circles';
const DESTINATION_LABEL_LAYER_ID = 'destination-labels';

let topDestinations = [];
let overlayActive = false;
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
                particleIndex: i
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

                // Draw particle as circle
                ctx.beginPath();
                ctx.arc(pixel.x, pixel.y, PARTICLE_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = PARTICLE_COLOR;
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
        particles = createParticles(flows);

        const destinationGeoJSON = buildDestinationGeoJSON(flows);
        addDestinationOverlay(destinationGeoJSON);
        setDestinationOverlayVisible(false);
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
            disableMapInteractions();
            break;
        case 1:
        case 2:
        case 3:
            focusOnDestination(response.index - 1);
            break;
        case 4:
            flyToDefault();
            setDestinationOverlayVisible(true);
            enableMapInteractions();
            break;
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
        .onStepEnter(handleStepEnter);

    window.addEventListener('resize', () => {
        scroller.resize();
        resizeCanvas();
    });
}

// Start
init();
