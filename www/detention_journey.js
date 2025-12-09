// Detention Journey Visualization
// Shows the paths of detained individuals moving between facilities in the US

console.log("detention_journey.js loaded!");

// Global variables
let detentionMap;
let detentionParticles = [];
let detentionAnimationActive = false;
let detentionAnimationFrameId;
let detentionCanvas;
let detentionCtx;
let currentHighlight = null; // 'none', 'person1', 'person2', 'chicago', 'facility1', 'facility2'
let stopBackgroundParticles = false; // Flag to stop grey particles at final step

// Data
let detentionFlows = [];
let detentionHighlights = [];
let detentionStatistics = null;

// Sequential animation state for highlighted individuals
let animatedPoints = {
    person1: {
        currentSegment: 0,
        progress: 0, // 0 to 1 along current segment
        visible: false,
        pulsePhase: 0, 
        trail: []
    },
    person2: {
        currentSegment: 0,
        progress: 0,
        visible: false,
        pulsePhase: 0,
        trail: []
    }
};

const SEGMENT_ANIMATION_SPEED = 0.02; // speed along each segment (continuous movement)

// Configuration
const DETENTION_SPEED_FACTOR = 0.005; // Even faster for continuous flow
const BACKGROUND_PARTICLE_RADIUS = 1.5; // Bigger to be more visible
const HIGHLIGHT_PARTICLE_RADIUS = 5;
const BACKGROUND_PARTICLE_COLOR = '#88888850'; // Darker gray, more visible
const HIGHLIGHT_PERSON1_COLOR = '#ff0000ee'; // Red, more opaque
const HIGHLIGHT_PERSON2_COLOR = '#0066ffee'; // Blue, more opaque

// Particle scaling: each particle represents this many transfers
const TRANSFERS_PER_PARTICLE = 50;
const MAX_PARTICLES_PER_ROUTE = 15; // Cap to avoid too many particles

const DETENTION_DEFAULT_CAMERA = {
    center: [-98, 38], // Center of continental US
    zoom: 4,
    pitch: 0,
    bearing: 0
};

const US_BOUNDS = [
    [-125, 24], // Southwest coordinates
    [-65, 52]   // Northeast coordinates
];

// Load detention journey data
async function loadDetentionData() {
    try {
        const [flowsResponse, highlightsResponse, statisticsResponse] = await Promise.all([
            fetch('data/detention_flows.json'),
            fetch('data/detention_highlights.json'),
            fetch('data/detention_statistics.json')
        ]);
        
        const flowsData = await flowsResponse.json();
        const highlightsData = await highlightsResponse.json();
        const statisticsData = await statisticsResponse.json();
        
        detentionFlows = flowsData.flows || [];
        detentionHighlights = highlightsData.highlights || [];
        detentionStatistics = statisticsData;
        
        console.log(`Loaded ${detentionFlows.length} detention flows`);
        console.log(`Loaded ${detentionHighlights.length} highlighted individuals`);
        console.log('Top person has', detentionHighlights[0]?.unique_facilities, 'unique facilities');
        console.log('Average transfer distance:', detentionStatistics.overall_stats.avg_transfer_distance_miles, 'miles');
        
        return { flows: detentionFlows, highlights: detentionHighlights, statistics: detentionStatistics };
    } catch (error) {
        console.error("Error loading detention data:", error);
        return { flows: [], highlights: [], statistics: null };
    }
}

// Create particles from detention flows
function createDetentionParticles(flows, highlights) {
    const particles = [];
    
    // Create background particles for aggregated flows
    flows.forEach((flow, flowIndex) => {
        if (!flow.origin || !flow.destination) return;
        
        const origin = flow.origin;
        const dest = flow.destination;
        
        if (!origin.lat || !origin.lon || !dest.lat || !dest.lon) return;
        
        const startCoords = [origin.lon, origin.lat];
        const endCoords = [dest.lon, dest.lat];
        
        // Skip if coordinates are the same
        if (origin.lat === dest.lat && origin.lon === dest.lon) return;
        
        const distance = turf.distance(startCoords, endCoords);
        if (distance < 0.1) return; // Skip very short segments
        
        const line = turf.greatCircle(
            turf.point(startCoords),
            turf.point(endCoords),
            { npoints: 50 }
        );
        
        // Calculate particles proportionally: 1 particle per TRANSFERS_PER_PARTICLE transfers
        // This makes each particle represent approximately 50 individuals transferred
        const numParticles = Math.min(
            MAX_PARTICLES_PER_ROUTE,
            Math.max(1, Math.ceil(flow.count / TRANSFERS_PER_PARTICLE))
        );
        
        for (let p = 0; p < numParticles; p++) {
            particles.push({
                line: line,
                distance: distance,
                progress: p / numParticles, // Stagger particles along the route
                speed: DETENTION_SPEED_FACTOR,
                startOffset: p / numParticles,
                type: 'background',
                flowIndex: flowIndex
            });
        }
    });
    
    console.log(`Created ${particles.length} background particles`);
    return particles;
}

// Reset animated point for a person
function resetAnimatedPoint(personKey) {
    animatedPoints[personKey].currentSegment = 0;
    animatedPoints[personKey].progress = 0;
    animatedPoints[personKey].visible = false;
    animatedPoints[personKey].pulsePhase = 0;
    animatedPoints[personKey].trail = [];
}

// Start animating a person's detention journey
function startPersonAnimation(personKey) {
    resetAnimatedPoint(personKey);
    animatedPoints[personKey].visible = true;
    console.log(`Starting animation for ${personKey}`);
}

// Update animated point position (continuous movement)
function updateAnimatedPoints(deltaTime) {
    ['person1', 'person2'].forEach((personKey, personIndex) => {
        const point = animatedPoints[personKey];
        if (!point.visible) return;
        
        const person = detentionHighlights[personIndex];
        if (!person || !person.path || person.path.length < 2) return;
        
        // Update pulse phase for firefly effect
        point.pulsePhase = (point.pulsePhase || 0) + deltaTime * 0.003; // Slow pulse
        
        // Animate along current segment continuously
        point.progress += SEGMENT_ANIMATION_SPEED;
        
        // When segment is complete, move to next segment
        if (point.progress >= 1) {
            point.currentSegment++;
            point.progress = 0;
            
            // Check if we've reached the end - DON'T loop, just stop at destination
            if (point.currentSegment >= person.path.length - 1) {
                point.currentSegment = person.path.length - 2; // Stay at last segment
                point.progress = 1; // Stay at end position
                // Don't reset - let it stay at the final destination
            }
        }
    });
}

// Draw animated points on canvas
function drawAnimatedPoints() {
    if (!detentionCanvas || !detentionCtx || !detentionMap) return;
    
    ['person1', 'person2'].forEach((personKey, personIndex) => {
        const point = animatedPoints[personKey];
        if (!point.visible) return;
        
        const person = detentionHighlights[personIndex];
        if (!person || !person.path || person.path.length < 2) return;
        
        const segmentIdx = point.currentSegment;
        if (segmentIdx >= person.path.length - 1) return;
        
        const start = person.path[segmentIdx];
        const end = person.path[segmentIdx + 1];
        
        if (!start.lat || !start.lon || !end.lat || !end.lon) return;
        
        // Use great circle path instead of linear interpolation for more natural movement
        const startCoords = [start.lon, start.lat];
        const endCoords = [end.lon, end.lat];
        const distance = turf.distance(startCoords, endCoords);
        const line = turf.greatCircle(turf.point(startCoords), turf.point(endCoords), { npoints: 50 });
        const currentDist = distance * point.progress;
        const pointOnLine = turf.along(line, currentDist);
        const coords = pointOnLine.geometry.coordinates;
        
        // Project to screen coordinates
        const pixel = detentionMap.project(coords);
        
        // Firefly effect: pulsing glow
        const color = personIndex === 0 ? '#ff0000' : '#0066ff';
        const pulseIntensity = 0.7 + 0.3 * Math.sin(point.pulsePhase || 0); // Pulse between 0.7 and 1.0
        const baseRadius = 6;
        const pulseRadius = baseRadius * pulseIntensity;
        
        // Initialize trail if not exists
        if (!point.trail) point.trail = [];
        
        // Add current position to trail
        point.trail.push({ x: pixel.x, y: pixel.y, time: Date.now() });
        // Keep only recent trail points (last 200ms)
        point.trail = point.trail.filter(t => Date.now() - t.time < 200);
        
        // Draw subtle trail (fading)
        if (point.trail.length > 1) {
            for (let i = 0; i < point.trail.length - 1; i++) {
                const trailOpacity = (i / point.trail.length) * 0.3 * pulseIntensity;
                const trailAlpha = Math.floor(trailOpacity * 255).toString(16).padStart(2, '0');
                detentionCtx.beginPath();
                detentionCtx.arc(point.trail[i].x, point.trail[i].y, baseRadius * 0.3, 0, Math.PI * 2);
                detentionCtx.fillStyle = color + trailAlpha;
                detentionCtx.fill();
            }
        }
        
        // Draw outer glow (pulsing gradient)
        const glowGradient = detentionCtx.createRadialGradient(
            pixel.x, pixel.y, 0,
            pixel.x, pixel.y, pulseRadius + 4
        );
        const glowAlpha1 = Math.floor(100 * pulseIntensity).toString(16).padStart(2, '0');
        const glowAlpha2 = Math.floor(40 * pulseIntensity).toString(16).padStart(2, '0');
        glowGradient.addColorStop(0, color + glowAlpha1);
        glowGradient.addColorStop(0.5, color + glowAlpha2);
        glowGradient.addColorStop(1, color + '00');
        
        detentionCtx.beginPath();
        detentionCtx.arc(pixel.x, pixel.y, pulseRadius + 4, 0, Math.PI * 2);
        detentionCtx.fillStyle = glowGradient;
        detentionCtx.fill();
        
        // Draw main point (pulsing)
        const mainAlpha = Math.floor(220 * pulseIntensity).toString(16).padStart(2, '0');
        detentionCtx.beginPath();
        detentionCtx.arc(pixel.x, pixel.y, pulseRadius, 0, Math.PI * 2);
        detentionCtx.fillStyle = color + mainAlpha;
        detentionCtx.fill();
        
        // Draw bright center (smaller, more intense)
        detentionCtx.beginPath();
        detentionCtx.arc(pixel.x, pixel.y, pulseRadius * 0.3, 0, Math.PI * 2);
        detentionCtx.fillStyle = '#ffffff';
        detentionCtx.fill();
    });
}

// Update detention counter display
function updateDetentionCounter() {
    ['person1', 'person2'].forEach((personKey, personIndex) => {
        const point = animatedPoints[personKey];
        if (!point.visible) return;
        
        const person = detentionHighlights[personIndex];
        if (!person || !person.path) return;
        
        // Determine which facility we're currently at or moving toward
        const currentFacilityIndex = point.progress < 0.5 
            ? point.currentSegment 
            : Math.min(point.currentSegment + 1, person.path.length - 1);
        
        const currentDetention = currentFacilityIndex + 1;
        const totalDetentions = person.path.length;
        const facility = person.path[currentFacilityIndex];
        
        // Update counter in the DOM
        const counterSelector = personIndex === 0 ? '.detention-counter-1' : '.detention-counter-2';
        const counterEl = document.querySelector(counterSelector);
        if (counterEl && facility) {
            counterEl.textContent = `Detention ${currentDetention} of ${totalDetentions}: ${facility.facility_name}`;
        }
    });
}

// Draw particles on canvas
let lastFrameTime = Date.now();

function drawDetentionParticles() {
    if (!detentionAnimationActive || !detentionCanvas || !detentionCtx) return;
    
    // Calculate delta time
    const currentTime = Date.now();
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    
    // Clear canvas
    detentionCtx.clearRect(0, 0, detentionCanvas.width, detentionCanvas.height);
    
    // Update and draw background particles (skip if flag is set)
    if (!stopBackgroundParticles) {
        detentionParticles.forEach(p => {
        p.progress += p.speed;
        
        if (p.progress >= 1) {
            p.progress = p.startOffset;
        }
        
        if (p.progress >= p.startOffset) {
            try {
                const normalizedProgress = (p.progress - p.startOffset) / (1 - p.startOffset);
                const currentDist = p.distance * normalizedProgress;
                const point = turf.along(p.line, currentDist);
                const coords = point.geometry.coordinates;
                
                const pixel = detentionMap.project(coords);
                
                detentionCtx.beginPath();
                detentionCtx.arc(pixel.x, pixel.y, BACKGROUND_PARTICLE_RADIUS, 0, Math.PI * 2);
                detentionCtx.fillStyle = BACKGROUND_PARTICLE_COLOR;
                detentionCtx.fill();
            } catch (error) {
                // Skip invalid particles
            }
        }
        });
    }
    
    // Update and draw animated points for highlighted individuals
    updateAnimatedPoints(deltaTime);
    drawAnimatedPoints();
    updateDetentionCounter();
    
    detentionAnimationFrameId = requestAnimationFrame(drawDetentionParticles);
}

// Create canvas overlay for particles
function createDetentionCanvasOverlay() {
    detentionCanvas = document.createElement('canvas');
    detentionCanvas.id = 'detention-particle-canvas';
    detentionCanvas.style.position = 'absolute';
    detentionCanvas.style.top = '0';
    detentionCanvas.style.left = '0';
    detentionCanvas.style.pointerEvents = 'none';
    detentionCanvas.style.zIndex = '1';
    
    const mapContainer = document.getElementById('detention-map');
    mapContainer.appendChild(detentionCanvas);
    
    detentionCanvas.width = mapContainer.offsetWidth;
    detentionCanvas.height = mapContainer.offsetHeight;
    
    detentionCtx = detentionCanvas.getContext('2d');
    
    console.log('Detention canvas overlay created:', detentionCanvas.width, 'x', detentionCanvas.height);
}

function resizeDetentionCanvas() {
    if (!detentionCanvas) return;
    const mapContainer = document.getElementById('detention-map');
    detentionCanvas.width = mapContainer.offsetWidth;
    detentionCanvas.height = mapContainer.offsetHeight;
}

// Initialize map
function initDetentionMap() {
    detentionMap = new maplibregl.Map({
        container: 'detention-map',
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: DETENTION_DEFAULT_CAMERA.center,
        zoom: DETENTION_DEFAULT_CAMERA.zoom,
        pitch: DETENTION_DEFAULT_CAMERA.pitch,
        bearing: DETENTION_DEFAULT_CAMERA.bearing
    });
    
    detentionMap.on('load', () => {
        console.log('Detention map loaded');
        
        // Set max bounds to focus on US
        detentionMap.setMaxBounds(US_BOUNDS);
        
        // Disable interactions initially
        disableDetentionMapInteractions();
    });
    
    // Update canvas and particles when map moves
    detentionMap.on('move', () => {
        if (detentionAnimationActive) {
            // Canvas drawing will update on next animation frame
        }
    });
    
    detentionMap.on('resize', resizeDetentionCanvas);
}

function disableDetentionMapInteractions() {
    if (!detentionMap) return;
    detentionMap.dragPan.disable();
    detentionMap.scrollZoom.disable();
    detentionMap.boxZoom.disable();
    detentionMap.doubleClickZoom.disable();
    detentionMap.touchZoomRotate.disable();
    detentionMap.keyboard.disable();
}

function enableDetentionMapInteractions() {
    if (!detentionMap) return;
    detentionMap.dragPan.enable();
    detentionMap.scrollZoom.enable();
    detentionMap.boxZoom.enable();
    detentionMap.doubleClickZoom.enable();
    detentionMap.touchZoomRotate.enable();
    detentionMap.keyboard.enable();
}

// Add facility markers to the map
function addFacilityMarkers(flows) {
    if (!detentionMap || !flows) return;
    
    // Calculate inputs and outputs for each facility
    const facilityStats = {};
    
    flows.forEach(flow => {
        // Count outputs (from origin)
        const originCode = flow.origin.facility_code;
        if (!facilityStats[originCode]) {
            facilityStats[originCode] = {
                code: originCode,
                name: flow.origin.facility_name,
                lat: flow.origin.lat,
                lon: flow.origin.lon,
                city: flow.origin.city,
                state: flow.origin.state,
                outputs: 0,
                inputs: 0
            };
        }
        facilityStats[originCode].outputs += flow.count;
        
        // Count inputs (to destination)
        const destCode = flow.destination.facility_code;
        if (!facilityStats[destCode]) {
            facilityStats[destCode] = {
                code: destCode,
                name: flow.destination.facility_name,
                lat: flow.destination.lat,
                lon: flow.destination.lon,
                city: flow.destination.city,
                state: flow.destination.state,
                outputs: 0,
                inputs: 0
            };
        }
        facilityStats[destCode].inputs += flow.count;
    });
    
    // Create GeoJSON from facilities
    const facilitiesGeoJSON = {
        type: 'FeatureCollection',
        features: Object.values(facilityStats).map(facility => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [facility.lon, facility.lat]
            },
            properties: {
                code: facility.code,
                name: facility.name,
                city: facility.city,
                state: facility.state,
                inputs: facility.inputs,
                outputs: facility.outputs,
                total: facility.inputs + facility.outputs
            }
        }))
    };
    
    // Add source
    if (!detentionMap.getSource('facilities')) {
        detentionMap.addSource('facilities', {
            type: 'geojson',
            data: facilitiesGeoJSON
        });
        
        // Add circle layer for facilities
        detentionMap.addLayer({
            id: 'facility-circles',
            type: 'circle',
            source: 'facilities',
            paint: {
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['get', 'total'],
                    0, 3,
                    5000, 6,
                    15000, 10
                ],
                'circle-color': '#4A90E2',
                'circle-opacity': 0.7,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-opacity': 0.8
            }
        });
        
        // Add hover effect
        detentionMap.on('mouseenter', 'facility-circles', (e) => {
            detentionMap.getCanvas().style.cursor = 'pointer';
            
            if (e.features.length > 0) {
                const facility = e.features[0].properties;
                
                // Create tooltip
                const tooltip = document.createElement('div');
                tooltip.className = 'facility-tooltip';
                tooltip.innerHTML = `
                    <strong>${facility.name}</strong><br>
                    <span style="font-size: 0.9em;">${facility.city}, ${facility.state}</span><br>
                    <hr style="margin: 4px 0; border: none; border-top: 1px solid #ccc;">
                    Transfers In: ${facility.inputs.toLocaleString()}<br>
                    Transfers Out: ${facility.outputs.toLocaleString()}<br>
                    <strong>Total: ${facility.total.toLocaleString()}</strong>
                `;
                tooltip.style.position = 'absolute';
                tooltip.style.left = e.point.x + 10 + 'px';
                tooltip.style.top = e.point.y + 10 + 'px';
                tooltip.id = 'facility-tooltip';
                
                // Remove any existing tooltip
                const existing = document.getElementById('facility-tooltip');
                if (existing) existing.remove();
                
                document.getElementById('detention-map').appendChild(tooltip);
            }
        });
        
        detentionMap.on('mouseleave', 'facility-circles', () => {
            detentionMap.getCanvas().style.cursor = '';
            const tooltip = document.getElementById('facility-tooltip');
            if (tooltip) tooltip.remove();
        });
        
        detentionMap.on('mousemove', 'facility-circles', (e) => {
            const tooltip = document.getElementById('facility-tooltip');
            if (tooltip && e.point) {
                tooltip.style.left = e.point.x + 10 + 'px';
                tooltip.style.top = e.point.y + 10 + 'px';
            }
        });
    }
    
    console.log(`Added ${Object.keys(facilityStats).length} facility markers`);
}

// Populate location statistics in HTML
function populateLocationStatistics(statistics) {
    if (!statistics) return;
    
    // Update average distance
    const avgDistEl = document.getElementById('avg-distance');
    if (avgDistEl) {
        avgDistEl.textContent = `${Math.round(statistics.overall_stats.avg_transfer_distance_miles)} miles (${Math.round(statistics.overall_stats.avg_transfer_distance_km)} km)`;
    }
    
    // Populate Chicago stats
    const chicago = statistics.featured_locations[0];
    if (chicago) {
        const facilityCountEl = document.getElementById('chicago-facility-count');
        if (facilityCountEl) facilityCountEl.textContent = chicago.facilities.length;
        
        const transfersEl = document.getElementById('chicago-transfers');
        if (transfersEl) {
            transfersEl.innerHTML = `
                <strong>Total:</strong> ${chicago.total_transfers.toLocaleString()}<br>
                <span style="color: #ff6b6b;">Outflows:</span> ${chicago.outflows.toLocaleString()}<br>
                <span style="color: #4a90e2;">Inflows:</span> ${chicago.inflows.toLocaleString()}
            `;
        }
        
        const destListEl = document.getElementById('chicago-destinations');
        if (destListEl && chicago.top_destinations) {
            destListEl.innerHTML = '<strong>To:</strong>' + chicago.top_destinations.slice(0, 3).map(dest => 
                `<li>${dest.name} - ${dest.count} transfers (${Math.round(dest.distance_miles)} miles)</li>`
            ).join('');
            
            if (chicago.top_origins && chicago.top_origins.length > 0) {
                destListEl.innerHTML += '<br><strong>From:</strong>' + chicago.top_origins.slice(0, 3).map(origin => 
                    `<li>${origin.name} - ${origin.count} transfers (${Math.round(origin.distance_miles)} miles)</li>`
                ).join('');
            }
        }
    }
    
    // Populate Facility 1 stats
    const facility1 = statistics.featured_locations[1];
    if (facility1) {
        const nameEl = document.getElementById('facility1-name');
        if (nameEl) nameEl.textContent = facility1.name;
        
        const locationEl = document.getElementById('facility1-location');
        if (locationEl) locationEl.textContent = `${facility1.city}, ${facility1.state}`;
        
        const transfersEl = document.getElementById('facility1-transfers');
        if (transfersEl) {
            transfersEl.innerHTML = `
                <strong>Total:</strong> ${facility1.total_transfers.toLocaleString()}<br>
                <span style="color: #ff6b6b;">Outflows:</span> ${facility1.outflows.toLocaleString()}<br>
                <span style="color: #4a90e2;">Inflows:</span> ${facility1.inflows.toLocaleString()}
            `;
        }
        
        const destListEl = document.getElementById('facility1-destinations');
        if (destListEl && facility1.top_destinations) {
            destListEl.innerHTML = '<strong>To:</strong>' + facility1.top_destinations.slice(0, 3).map(dest => 
                `<li>${dest.name} - ${dest.count} transfers (${Math.round(dest.distance_miles)} miles)</li>`
            ).join('');
            
            if (facility1.top_origins && facility1.top_origins.length > 0) {
                destListEl.innerHTML += '<br><strong>From:</strong>' + facility1.top_origins.slice(0, 3).map(origin => 
                    `<li>${origin.name} - ${origin.count} transfers (${Math.round(origin.distance_miles)} miles)</li>`
                ).join('');
            }
        }
    }
    
    // Populate Facility 2 stats
    const facility2 = statistics.featured_locations[2];
    if (facility2) {
        const nameEl = document.getElementById('facility2-name');
        if (nameEl) nameEl.textContent = facility2.name;
        
        const locationEl = document.getElementById('facility2-location');
        if (locationEl) locationEl.textContent = `${facility2.city}, ${facility2.state}`;
        
        const transfersEl = document.getElementById('facility2-transfers');
        if (transfersEl) {
            transfersEl.innerHTML = `
                <strong>Total:</strong> ${facility2.total_transfers.toLocaleString()}<br>
                <span style="color: #ff6b6b;">Outflows:</span> ${facility2.outflows.toLocaleString()}<br>
                <span style="color: #4a90e2;">Inflows:</span> ${facility2.inflows.toLocaleString()}
            `;
        }
        
        const destListEl = document.getElementById('facility2-destinations');
        if (destListEl && facility2.top_destinations) {
            destListEl.innerHTML = '<strong>To:</strong>' + facility2.top_destinations.slice(0, 3).map(dest => 
                `<li>${dest.name} - ${dest.count} transfers (${Math.round(dest.distance_miles)} miles)</li>`
            ).join('');
            
            if (facility2.top_origins && facility2.top_origins.length > 0) {
                destListEl.innerHTML += '<br><strong>From:</strong>' + facility2.top_origins.slice(0, 3).map(origin => 
                    `<li>${origin.name} - ${origin.count} transfers (${Math.round(origin.distance_miles)} miles)</li>`
                ).join('');
            }
        }
    }
}

// Populate the story cards with highlighted individual information
function populateDetentionStoryCards(highlights) {
    highlights.forEach((person, index) => {
        const cardSelector = index === 0 ? '.story1-step' : '.story2-step';
        const card = document.querySelector(cardSelector);
        if (!card) return;
        
        const story = person.story_data;
        
        // Update demographics
        const demoEl = card.querySelector('.person-demographics');
        if (demoEl && story) {
            const age = story.birth_year ? new Date().getFullYear() - story.birth_year : 'Unknown';
            demoEl.innerHTML = `
                <p><strong>Gender:</strong> ${story.gender || 'Unknown'}</p>
                <p><strong>Age:</strong> ~${age}</p>
                <p><strong>Citizenship:</strong> ${story.citizenship || 'Unknown'}</p>
            `;
        }
        
        // Update journey details
        const journeyEl = card.querySelector('.person-journey');
        if (journeyEl && story) {
            const firstDate = story.first_date ? new Date(story.first_date).toLocaleDateString() : 'Unknown';
            const lastDate = story.last_date ? new Date(story.last_date).toLocaleDateString() : 'Unknown';
            const totalMiles = Math.round(story.total_distance_miles || 0);
            const totalKm = Math.round(story.total_distance_km || 0);
            journeyEl.innerHTML = `
                <p><strong>First detention:</strong> ${story.first_facility} (${story.first_state})</p>
                <p><strong>Date:</strong> ${firstDate}</p>
                <p><strong>Last detention:</strong> ${story.last_facility} (${story.last_state})</p>
                <p><strong>Date:</strong> ${lastDate}</p>
                <p><strong>Total distance traveled:</strong> ${totalMiles.toLocaleString()} miles (${totalKm.toLocaleString()} km)</p>
                <p>Through <strong>${person.unique_facilities} different facilities</strong> with <strong>${person.transfer_count} total detentions</strong>.</p>
            `;
        }
    });
}

// Camera focusing functions
function flyToDetentionDefault() {
    if (!detentionMap) return;
    detentionMap.flyTo({
        center: DETENTION_DEFAULT_CAMERA.center,
        zoom: DETENTION_DEFAULT_CAMERA.zoom,
        pitch: DETENTION_DEFAULT_CAMERA.pitch,
        bearing: DETENTION_DEFAULT_CAMERA.bearing,
        speed: 0.6
    });
}

function focusOnPerson(personIndex) {
    if (!detentionMap || !detentionHighlights[personIndex]) return;
    
    const person = detentionHighlights[personIndex];
    
    // Calculate bounding box for this person's journey
    const coords = person.path.map(p => [p.lon, p.lat]);
    const bbox = coords.reduce((bounds, coord) => {
        return [
            [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
            [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])]
        ];
    }, [[coords[0][0], coords[0][1]], [coords[0][0], coords[0][1]]]);
    
    // Fit map to bounding box
    detentionMap.fitBounds(bbox, {
        padding: { top: 100, bottom: 100, left: 100, right: 100 },
        speed: 0.8,
        maxZoom: 6
    });
}

// Scrollytelling setup
function initDetentionScrollytelling() {
    const scroller = scrollama();
    
    scroller
        .setup({
            step: '#detention-section .step',
            offset: 0.5,
            debug: false
        })
        .onStepEnter(response => {
            // Update active state
            document.querySelectorAll('#detention-section .step').forEach(step => 
                step.classList.remove('is-active')
            );
            response.element.classList.add('is-active');
            
            // Handle different steps
            const stepClass = response.element.className;
            
            if (stepClass.includes('intro-step')) {
                console.log('Step: Intro - showing all background flows');
                currentHighlight = 'none';
                stopBackgroundParticles = false; // Reset flag
                // Hide animated points
                animatedPoints.person1.visible = false;
                animatedPoints.person2.visible = false;
                flyToDetentionDefault();
                if (!detentionAnimationActive) {
                    detentionAnimationActive = true;
                    lastFrameTime = Date.now();
                    drawDetentionParticles();
                }
            } else if (stepClass.includes('chicago-step')) {
                console.log('Step: Chicago zoom');
                currentHighlight = 'chicago';
                animatedPoints.person1.visible = false;
                animatedPoints.person2.visible = false;
                if (detentionStatistics && detentionStatistics.featured_locations[0]) {
                    const chicago = detentionStatistics.featured_locations[0];
                    detentionMap.flyTo({
                        center: chicago.camera.center,
                        zoom: 9,
                        pitch: chicago.camera.pitch,
                        bearing: chicago.camera.bearing,
                        speed: 0.7
                    });
                }
            } else if (stepClass.includes('facility1-step')) {
                console.log('Step: Busiest facility #1');
                currentHighlight = 'facility1';
                animatedPoints.person1.visible = false;
                animatedPoints.person2.visible = false;
                if (detentionStatistics && detentionStatistics.featured_locations[1]) {
                    const facility = detentionStatistics.featured_locations[1];
                    detentionMap.flyTo({
                        center: facility.camera.center,
                        zoom: facility.camera.zoom,
                        speed: 0.7
                    });
                }
            } else if (stepClass.includes('facility2-step')) {
                console.log('Step: Busiest facility #2');
                currentHighlight = 'facility2';
                animatedPoints.person1.visible = false;
                animatedPoints.person2.visible = false;
                if (detentionStatistics && detentionStatistics.featured_locations[2]) {
                    const facility = detentionStatistics.featured_locations[2];
                    detentionMap.flyTo({
                        center: facility.camera.center,
                        zoom: facility.camera.zoom,
                        speed: 0.7
                    });
                }
            } else if (stepClass.includes('story1-step')) {
                console.log('Step: Detention Story 1');
                currentHighlight = 'person1';
                animatedPoints.person2.visible = false;
                startPersonAnimation('person1');
                focusOnPerson(0);
            } else if (stepClass.includes('story2-step')) {
                console.log('Step: Detention Story 2');
                currentHighlight = 'person2';
                animatedPoints.person1.visible = false;
                startPersonAnimation('person2');
                focusOnPerson(1);
            } else if (stepClass.includes('reflection-step')) {
                console.log('Step: Reflection - zoom out');
                currentHighlight = 'none';
                animatedPoints.person1.visible = false;
                animatedPoints.person2.visible = false;
                flyToDetentionDefault();
            } else if (stepClass.includes('interactive-step')) {
                console.log('Step: Interactive exploration');
                currentHighlight = 'none';
                animatedPoints.person1.visible = false;
                animatedPoints.person2.visible = false;
                flyToDetentionDefault();
                // Stop grey particles so user can explore just the facilities
                stopBackgroundParticles = true;
                // Enable map interactions for user exploration
                enableDetentionMapInteractions();
            }
        })
        .onStepExit(response => {
            // Check if we're exiting the last step (interactive-step)
            const stepClass = response.element.className;
            if (stepClass.includes('interactive-step') && response.direction === 'down') {
                console.log('Exiting last detention step - triggering exit animation');
                
                // Add exit class to article for CSS transitions
                const article = document.querySelector('#detention-section article');
                if (article) {
                    article.classList.add('exiting');
                }
                
                // Recenter and reset zoom to default
                setTimeout(() => {
                    flyToDetentionDefault();
                    // Fade out cards
                    document.querySelectorAll('#detention-section article .step').forEach(step => {
                        step.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
                        step.style.opacity = '0';
                        step.style.transform = 'translateY(-20px)';
                    });
                }, 100);
            }
        })
        .onStepExit(response => {
            // Check if we're exiting the last step (interactive-step)
            const stepClass = response.element.className;
            if (stepClass.includes('interactive-step') && response.direction === 'down') {
                console.log('Exiting last detention step - showing data sources overlay');
                // Show data sources overlay when scrolling past the last step
                setTimeout(() => {
                    if (window.showDataSourcesOverlay) {
                        window.showDataSourcesOverlay();
                    }
                }, 500);
            }
        });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        scroller.resize();
        resizeDetentionCanvas();
    });
    
    console.log('Detention scrollytelling initialized');
}

// Main initialization
async function initDetentionJourneyVisualization() {
    console.log('Initializing detention journey visualization...');
    
    // Load data
    const data = await loadDetentionData();
    
    if (data.flows.length === 0 || data.highlights.length === 0) {
        console.error('No detention data loaded');
        return;
    }
    
    // Initialize map
    initDetentionMap();
    
    // Wait for map to load
    detentionMap.once('load', () => {
        // Add facility markers
        addFacilityMarkers(data.flows);
        
        // Create particles
        detentionParticles = createDetentionParticles(data.flows, data.highlights);
        
        // Create canvas overlay
        createDetentionCanvasOverlay();
        
        // Populate location statistics
        populateLocationStatistics(data.statistics);
        
        // Populate story cards
        populateDetentionStoryCards(data.highlights);
        
        // Initialize scrollytelling
        initDetentionScrollytelling();
        
        // Start with intro state (no animation yet)
        currentHighlight = 'none';
        
        console.log('Detention journey visualization ready');
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDetentionJourneyVisualization);
} else {
    initDetentionJourneyVisualization();
}

// Data Sources Overlay Functions (global scope for HTML onclick)
window.showDataSourcesOverlay = function() {
    const overlay = document.getElementById('data-sources-overlay');
    if (overlay) {
        overlay.classList.add('active');
        // Prevent body scroll when overlay is open
        document.body.style.overflow = 'hidden';
    }
};

window.closeDataSourcesOverlay = function() {
    const overlay = document.getElementById('data-sources-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        // Restore body scroll
        document.body.style.overflow = '';
    }
};

// Close overlay when clicking on backdrop
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('data-sources-overlay');
    if (overlay) {
        const backdrop = overlay.querySelector('.overlay-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', window.closeDataSourcesOverlay);
        }
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                window.closeDataSourcesOverlay();
            }
        });
    }
});

