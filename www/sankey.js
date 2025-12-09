// Sankey Diagram for Deportation Pipeline
// Shows flow: Arrest → Detention → Removal
// Using latest d3-sankey API with simplified source-target-value data format

// SVG dimensions
const width = 1300;
const height = 500;
const margin = { top: 40, right: 220, bottom: 40, left: 180 };

// Color scheme for nodes
const nodeColors = {
    Arrest: "#ff6b6b", // Red
    "No ICE Arrest": "#9e9e9e", // Gray
    Detention: "#4ecdc4", // Teal
    "No Detention": "#b0bec5", // Gray-blue
    Removal: "#c8a2c8", // Light Purple
    "No Removal": "#ffb347", // Orange
};

// Color scheme for links
const linkColors = {
    "Arrest-Detention": "#ff6b6b", // Red (from Arrest)
    "Arrest-No Detention": "#b0bec5", // Gray-blue
    "No ICE Arrest-Detention": "#9e9e9e", // Gray
    "Detention-Removal": "#b39ddb", // Light purple (towards Removal)
    "Detention-No Removal": "#ffb347", // Orange
};

// Initialize Sankey diagram
async function initSankey() {
    try {
        // Load data
        const response = await fetch("data/sankey_data.json");

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        console.log("Sankey data loaded:", data);

        if (!data.links || data.links.length === 0) {
            console.error("No links in data");
            document.getElementById("sankey-container").innerHTML =
                "<p>Error: No data available.</p>";
            return;
        }

        // Render the diagram
        renderSankey(data);
    } catch (error) {
        console.error("Error loading Sankey data:", error);
        console.error("Error details:", error.message, error.stack);
        document.getElementById("sankey-container").innerHTML =
            `<p>Error loading data: ${error.message}. Please check the browser console for details.</p>`;
    }
}

function renderSankey(data) {
    // Clear existing SVG
    d3.select("#sankey-container").selectAll("*").remove();

    // Create SVG with extra space for labels
    const svg = d3
        .select("#sankey-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("style", "overflow: visible; background: transparent;");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Prepare data for d3-sankey
    // Define nodes in explicit order with depth to force column positions
    // depth = column position (0 = leftmost, 1 = middle, 2 = rightmost)
    const nodes = [
        { name: "Arrest" },
        { name: "No ICE Arrest" },
        { name: "Detention" },
        { name: "No Detention" },
        { name: "Removal" },
        { name: "No Removal" },
    ];

    // Map links to reference node objects instead of strings
    const links = data.links.map((link) => ({
        source: nodes.find((n) => n.name === link.source),
        target: nodes.find((n) => n.name === link.target),
        value: link.value,
    }));

    const graph = { nodes, links };

    console.log("Graph data:", graph);
    console.log("Nodes:", nodes);
    console.log("Links:", links);

    // Create Sankey generator
    const sankey = d3
        .sankey()
        .nodeWidth(20)
        .nodePadding(40)
        .extent([
            [0, 0],
            [width - margin.left - margin.right, height - margin.top - margin.bottom],
        ])
        .nodeAlign(d3.sankeyLeft)
        .nodeSort(null); // Maintain input order

    // Generate layout
    const layout = sankey(graph);
    const layoutNodes = layout.nodes;
    const layoutLinks = layout.links;

    console.log("Layout nodes:", layoutNodes);
    console.log("Layout links:", layoutLinks);
    console.log(
        "Node positions:",
        layoutNodes.map(
            (n) =>
                `${n.name || "unknown"} at x: ${n.x0?.toFixed(0)}-${n.x1?.toFixed(0)}, depth: ${n.depth}`
        )
    );
    console.log(
        "Node details:",
        layoutNodes.map((n) => ({
            name: n.name,
            x0: n.x0,
            x1: n.x1,
            y0: n.y0,
            y1: n.y1,
            depth: n.depth,
        }))
    );

    // Create tooltip div for custom tooltips
    let tooltip = d3.select("#sankey-tooltip");
    if (tooltip.empty()) {
        tooltip = d3
            .select("body")
            .append("div")
            .attr("id", "sankey-tooltip")
            .style("position", "absolute")
            .style("background-color", "rgba(0, 0, 0, 0.85)")
            .style("color", "#fff")
            .style("padding", "10px 15px")
            .style("border-radius", "6px")
            .style("font-size", "14px")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .style("z-index", 1000)
            .style("box-shadow", "0 2px 8px rgba(0,0,0,0.3)");
    }

    // Draw links
    const link = g
        .append("g")
        .selectAll("path")
        .data(layoutLinks)
        .enter()
        .append("path")
        .attr("d", d3.sankeyLinkHorizontal())
        .attr("stroke", (d) => {
            // Determine color based on source and target names
            const sourceName = d.source.name || "";
            const targetName = d.target.name || "";

            const key = `${sourceName}-${targetName}`;
            if (linkColors[key]) {
                return linkColors[key];
            }
            return "#999";
        })
        .attr("stroke-width", (d) => Math.max(2, d.width))
        .attr("fill", "none")
        .attr("opacity", 0.5)
        .attr("stroke-opacity", 0.6)
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
            console.log("Link hover:", d.source.name, "→", d.target.name, "value:", d.value);

            d3.select(this).attr("opacity", 0.9).attr("stroke-opacity", 1);

            const sourceName = d.source.name || "Unknown";
            const targetName = d.target.name || "Unknown";
            const linkKey = `${sourceName}-${targetName}`;

            console.log("Link key:", linkKey, "Color:", linkColors[linkKey]);

            tooltip.transition().duration(200).style("opacity", 1);
            tooltip
                .html(
                    `<strong>${sourceName} → ${targetName}</strong><br/>${d.value.toLocaleString()} people`
                )
                .style("left", `${event.pageX + 15}px`)
                .style("top", `${event.pageY - 28}px`);
        })
        .on("mousemove", (event, _d) => {
            tooltip.style("left", `${event.pageX + 15}px`).style("top", `${event.pageY - 28}px`);
        })
        .on("mouseout", function (_event, _d) {
            d3.select(this).attr("opacity", 0.5).attr("stroke-opacity", 0.6);

            tooltip.transition().duration(500).style("opacity", 0);
        });

    // Add native SVG tooltips as fallback
    link.append("title").text((d) => {
        const sourceName = d.source.name || "Unknown";
        const targetName = d.target.name || "Unknown";
        return `${sourceName} → ${targetName}: ${d.value.toLocaleString()}`;
    });

    // Draw nodes
    const node = g
        .append("g")
        .selectAll("g")
        .data(layoutNodes)
        .enter()
        .append("g")
        .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

    // Node rectangles
    node.append("rect")
        .attr("height", (d) => d.y1 - d.y0)
        .attr("width", (d) => d.x1 - d.x0)
        .attr("fill", (d) => {
            const nodeName = d.name || "";
            return nodeColors[nodeName] || "#999";
        })
        .attr("opacity", 0.8)
        .attr("rx", 3)
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
            d3.select(this).attr("opacity", 1);

            const nodeName = d.name || "Unknown";
            const incoming = layoutLinks
                .filter((l) => l.target === d)
                .reduce((sum, l) => sum + l.value, 0);
            const outgoing = layoutLinks
                .filter((l) => l.source === d)
                .reduce((sum, l) => sum + l.value, 0);

            tooltip.transition().duration(200).style("opacity", 1);
            tooltip
                .html(
                    `<strong>${nodeName}</strong><br/>Incoming: ${incoming.toLocaleString()}<br/>Outgoing: ${outgoing.toLocaleString()}`
                )
                .style("left", `${event.pageX + 15}px`)
                .style("top", `${event.pageY - 28}px`);
        })
        .on("mousemove", (event, _d) => {
            tooltip.style("left", `${event.pageX + 15}px`).style("top", `${event.pageY - 28}px`);
        })
        .on("mouseout", function (_event, _d) {
            d3.select(this).attr("opacity", 0.8);

            tooltip.transition().duration(500).style("opacity", 0);
        });

    // Label positioning - position labels at the vertical center of each node
    const getLabelX = (d) => {
        if (d.depth === 0) {
            return -15; // Left side nodes - label to the left
        } else {
            return d.x1 - d.x0 + 20; // Other nodes - label to the right
        }
    };

    const getLabelAnchor = (d) => {
        return d.depth === 0 ? "end" : "start";
    };

    // Node labels - positioned at each node's vertical center (relative to group transform)
    node.append("text")
        .attr("x", (d) => {
            const x = getLabelX(d);
            const height = d.y1 - d.y0;
            const localY = height / 2;
            console.log(
                `Label for ${d.name}: depth=${d.depth}, y0=${d.y0.toFixed(1)}, y1=${d.y1.toFixed(1)}, height=${height.toFixed(1)}, localY=${localY.toFixed(1)}, labelX=${x}`
            );
            return x;
        })
        .attr("y", (d) => (d.y1 - d.y0) / 2) // Center relative to node height (local coords)
        .attr("dy", "0.35em")
        .attr("text-anchor", (d) => getLabelAnchor(d))
        .attr("font-size", "16px")
        .attr("font-weight", "bold")
        .attr("fill", "#333")
        .attr("pointer-events", "none") // Let hover events pass through to nodes
        .text((d) => {
            console.log(`  Text content for ${d.name}: "${d.name}"`);
            return d.name || "Unknown";
        });

    // Node values (counts) - positioned below the label (relative to group transform)
    node.append("text")
        .attr("x", (d) => getLabelX(d))
        .attr("y", (d) => (d.y1 - d.y0) / 2 + 18) // Below the label (local coords)
        .attr("text-anchor", (d) => getLabelAnchor(d))
        .attr("font-size", "12px")
        .attr("fill", "#666")
        .attr("pointer-events", "none") // Let hover events pass through
        .text((d) => {
            // Calculate total flow through node
            const incoming = layoutLinks
                .filter((l) => l.target === d)
                .reduce((sum, l) => sum + l.value, 0);
            const outgoing = layoutLinks
                .filter((l) => l.source === d)
                .reduce((sum, l) => sum + l.value, 0);
            const total = incoming || outgoing;
            console.log(`  Value for ${d.name}: ${total.toLocaleString()}`);
            return total.toLocaleString();
        });

    // Add tooltips to nodes
    node.append("title").text((d) => {
        const nodeName = d.name || "Unknown";
        const incoming = layoutLinks
            .filter((l) => l.target === d)
            .reduce((sum, l) => sum + l.value, 0);
        const outgoing = layoutLinks
            .filter((l) => l.source === d)
            .reduce((sum, l) => sum + l.value, 0);
        return `${nodeName}\nIncoming: ${incoming.toLocaleString()}\nOutgoing: ${outgoing.toLocaleString()}`;
    });
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSankey);
} else {
    initSankey();
}
