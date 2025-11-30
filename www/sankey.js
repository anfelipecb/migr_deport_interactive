// Sankey Diagram for Deportation Pipeline
// Shows flow: Arrest → Detention → Removal
// Using latest d3-sankey API with simplified source-target-value data format

// SVG dimensions
const width = 1000;
const height = 450;
const margin = { top: 40, right: 180, bottom: 40, left: 120 };

// Color scheme for nodes
const nodeColors = {
    'Arrest': '#FF6B6B',      // Red
    'Detention': '#4ECDC4',   // Teal
    'Removal': '#C8A2C8'      // Light Purple
};

// Color scheme for links
const linkColors = {
    'Arrest-Detention': '#FF6B6B',   // Red
    'Arrest-Removal': '#4ECDC4',     // Teal
    'Detention-Removal': '#95E1D3'   // Light Teal
};

// Initialize Sankey diagram
async function initSankey() {
    try {
        // Load data
        const response = await fetch('data/sankey_data.json');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log('Sankey data loaded:', data);
        
        if (!data.links || data.links.length === 0) {
            console.error('No links in data');
            document.getElementById('sankey-container').innerHTML = 
                '<p>Error: No data available.</p>';
            return;
        }
        
        // Render the diagram
        renderSankey(data);
        
    } catch (error) {
        console.error('Error loading Sankey data:', error);
        console.error('Error details:', error.message, error.stack);
        document.getElementById('sankey-container').innerHTML = 
            `<p>Error loading data: ${error.message}. Please check the browser console for details.</p>`;
    }
}

function renderSankey(data) {
    // Clear existing SVG
    d3.select('#sankey-container').selectAll('*').remove();
    
    // Create SVG
    const svg = d3.select('#sankey-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('style', 'overflow: visible;');
    
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Prepare data for d3-sankey
    // Define nodes in explicit order with depth to force column positions
    // depth = column position (0 = leftmost, 1 = middle, 2 = rightmost)
    const nodes = [
        { name: 'Arrest', depth: 0 },
        { name: 'Detention', depth: 1 },
        { name: 'Removal', depth: 2 }
    ];
    
    // Map links to reference node objects instead of strings
    const links = data.links.map(link => ({
        source: nodes.find(n => n.name === link.source),
        target: nodes.find(n => n.name === link.target),
        value: link.value
    }));
    
    const graph = { nodes, links };
    
    console.log('Graph data:', graph);
    console.log('Nodes:', nodes);
    console.log('Links:', links);
    
    // Create Sankey generator
    const sankey = d3.sankey()
        .nodeWidth(15)
        .nodePadding(40)
        .extent([[0, 0], [width - margin.left - margin.right, height - margin.top - margin.bottom]])
        .nodeSort(null); // Maintain input order
    
    // Generate layout
    const layout = sankey(graph);
    const layoutNodes = layout.nodes;
    const layoutLinks = layout.links;
    
    console.log('Layout nodes:', layoutNodes);
    console.log('Layout links:', layoutLinks);
    console.log('Node positions:', layoutNodes.map(n => `${n.name || 'unknown'} at x: ${n.x0?.toFixed(0)}-${n.x1?.toFixed(0)}, depth: ${n.depth}`));
    console.log('Node details:', layoutNodes.map(n => ({
        name: n.name,
        x0: n.x0,
        x1: n.x1,
        y0: n.y0,
        y1: n.y1,
        depth: n.depth
    })));
    
    // Draw links
    const link = g.append('g')
        .selectAll('path')
        .data(layoutLinks)
        .enter()
        .append('path')
        .attr('d', d3.sankeyLinkHorizontal())
        .attr('stroke', (d) => {
            // Determine color based on source and target names
            const sourceName = d.source.name || '';
            const targetName = d.target.name || '';
            
            if (sourceName === 'Arrest' && targetName === 'Detention') {
                return linkColors['Arrest-Detention'];
            } else if (sourceName === 'Arrest' && targetName === 'Removal') {
                return linkColors['Arrest-Removal'];
            } else if (sourceName === 'Detention' && targetName === 'Removal') {
                return '#C8A2C8'; // Light purple for Detention->Removal
            }
            return '#999';
        })
        .attr('stroke-width', (d) => Math.max(2, d.width))
        .attr('fill', 'none')
        .attr('opacity', 0.5)
        .attr('stroke-opacity', 0.6);
    
    // Add tooltips to links
    link.append('title')
        .text((d) => {
            const sourceName = d.source.name || 'Unknown';
            const targetName = d.target.name || 'Unknown';
            return `${sourceName} → ${targetName}: ${d.value.toLocaleString()}`;
        });
    
    // Draw nodes
    const node = g.append('g')
        .selectAll('g')
        .data(layoutNodes)
        .enter()
        .append('g')
        .attr('transform', (d) => `translate(${d.x0},${d.y0})`);
    
    // Node rectangles
    node.append('rect')
        .attr('height', (d) => d.y1 - d.y0)
        .attr('width', (d) => d.x1 - d.x0)
        .attr('fill', (d) => {
            const nodeName = d.name || '';
            return nodeColors[nodeName] || '#999';
        })
        .attr('opacity', 0.8)
        .attr('rx', 3);
    
    // Node labels
    node.append('text')
        .attr('x', (d) => {
            // Position based on depth: left node on left, right node on right, middle can be either
            console.log(`Positioning label for ${d.name}: depth=${d.depth}, x0=${d.x0}, x1=${d.x1}`);
            if (d.depth === 0) {
                // Leftmost node - label on left
                return -15;
            } else {
                // Other nodes - label on right
                return d.x1 - d.x0 + 20;
            }
        })
        .attr('y', (d) => (d.y1 + d.y0) / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', (d) => {
            return d.depth === 0 ? 'end' : 'start';
        })
        .attr('font-size', '18px')
        .attr('font-weight', 'bold')
        .attr('fill', '#333')
        .text((d) => d.name || 'Unknown');
    
    // Node values (counts)
    node.append('text')
        .attr('x', (d) => {
            if (d.depth === 0) {
                return -15;
            } else {
                return d.x1 - d.x0 + 20;
            }
        })
        .attr('y', (d) => (d.y1 + d.y0) / 2 + 18)
        .attr('text-anchor', (d) => {
            return d.depth === 0 ? 'end' : 'start';
        })
        .attr('font-size', '12px')
        .attr('fill', '#666')
        .text((d) => {
            // Calculate total flow through node
            const incoming = layoutLinks.filter(l => l.target === d)
                .reduce((sum, l) => sum + l.value, 0);
            const outgoing = layoutLinks.filter(l => l.source === d)
                .reduce((sum, l) => sum + l.value, 0);
            return (incoming || outgoing).toLocaleString();
        });
    
    // Add tooltips to nodes
    node.append('title')
        .text((d) => {
            const nodeName = d.name || 'Unknown';
            const incoming = layoutLinks.filter(l => l.target === d)
                .reduce((sum, l) => sum + l.value, 0);
            const outgoing = layoutLinks.filter(l => l.source === d)
                .reduce((sum, l) => sum + l.value, 0);
            return `${nodeName}\nIncoming: ${incoming.toLocaleString()}\nOutgoing: ${outgoing.toLocaleString()}`;
        });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSankey);
} else {
    initSankey();
}
