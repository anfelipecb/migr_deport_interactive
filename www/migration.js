// Migration visualization with person icons
// Shows historical immigrant population growth from 1850 to 2024

console.log("migration.js loaded!");

let migrationData = [];
let migrationViz = null;

// Person icon configuration
const PERSON_SIZE = 28; // Slightly larger icons
const _PEOPLE_PER_ICON = 200000;
const _PERSON_ICON_PATH = "imgs/person-svgrepo-com.svg"; // Path to your custom person icon

// SVG path from the person icon (extracted from the SVG file)
const PERSON_SVG_PATH =
    "M13.9 2.999A1.9 1.9 0 1 1 12 1.1a1.9 1.9 0 0 1 1.9 1.899zM13.544 6h-3.088a1.855 1.855 0 0 0-1.8 1.405l-1.662 6.652a.667.667 0 0 0 .14.573.873.873 0 0 0 .665.33.718.718 0 0 0 .653-.445L10 9.1V13l-.922 9.219a.71.71 0 0 0 .707.781h.074a.69.69 0 0 0 .678-.563L12 14.583l1.463 7.854a.69.69 0 0 0 .678.563h.074a.71.71 0 0 0 .707-.781L14 13V9.1l1.548 5.415a.718.718 0 0 0 .653.444.873.873 0 0 0 .665-.329.667.667 0 0 0 .14-.573l-1.662-6.652A1.855 1.855 0 0 0 13.544 6z";

async function loadMigrationData() {
    try {
        const response = await fetch("data/migration_data.json");
        migrationData = await response.json();
        console.log(`Loaded migration data for ${migrationData.length} periods`);
        return migrationData;
    } catch (error) {
        console.error("Error loading migration data:", error);
        return [];
    }
}

function calculateCenteredPositions(count) {
    // Create a centered square grid and order positions from center outward
    const positions = [];
    if (count === 0) return positions;

    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    const spacing = PERSON_SIZE * 1.2;
    const gridWidth = (cols - 1) * spacing;
    const gridHeight = (rows - 1) * spacing;
    const offsetX = -gridWidth / 2;
    const offsetY = -gridHeight / 2;

    let idx = 0;
    for (let r = 0; r < rows && idx < count; r++) {
        for (let c = 0; c < cols && idx < count; c++) {
            const x = offsetX + c * spacing;
            const y = offsetY + r * spacing;
            const dist = Math.sqrt(x * x + y * y);
            const angle = Math.atan2(y, x);
            positions.push({ x, y, dist, angle, row: r, col: c });
            idx++;
        }
    }

    // Sort so icons are assigned from center outward evenly
    positions.sort((a, b) => {
        if (a.dist !== b.dist) return a.dist - b.dist;
        return a.angle - b.angle;
    });

    return positions;
}

function createMigrationVisualization() {
    const container = d3.select("#migration-viz");
    const containerNode = container.node();

    if (!containerNode) {
        console.error("Migration viz container not found");
        return null;
    }

    const width = containerNode.clientWidth;
    const height = containerNode.clientHeight;

    // Clear any existing SVG
    container.selectAll("svg").remove();

    const svg = container.append("svg").attr("width", width).attr("height", height);

    const iconGroup = svg
        .append("g")
        .attr("class", "icon-group")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    // Calculate max icons needed
    const maxIcons = Math.max(...migrationData.map((d) => d.iconCount));
    const positions = calculateCenteredPositions(maxIcons);

    // Create all icons upfront
    const icons = iconGroup
        .selectAll(".person-icon")
        .data(positions)
        .enter()
        .append("g")
        .attr("class", "person-icon")
        .attr("transform", (d, _i) => `translate(${d.x}, ${d.y})`)
        .style("opacity", 0);

    // Use the custom person icon as inline SVG so we can control the fill color
    const personGroup = icons
        .append("g")
        .attr(
            "transform",
            `translate(-${PERSON_SIZE / 2}, -${PERSON_SIZE / 2}) scale(${PERSON_SIZE / 24})`
        );

    personGroup.append("path").attr("d", PERSON_SVG_PATH).style("fill", "#ccc");

    return { svg, icons, positions };
}

function updateMigrationViz(year) {
    if (!migrationViz) return;

    const dataPoint = migrationData.find((d) => d.year === year);
    if (!dataPoint) return;

    const { icons } = migrationViz;
    const iconCount = dataPoint.iconCount;

    // Determine which icons are new for this period
    const previousData = migrationData.filter((d) => d.year < year);
    const previousIconCount =
        previousData.length > 0 ? Math.max(...previousData.map((d) => d.iconCount)) : 0;

    console.log(
        `Year ${year}: showing ${iconCount} icons (${previousIconCount} previous + ${iconCount - previousIconCount} new)`
    );

    // Update all icons
    icons.each(function (_d, i) {
        const icon = d3.select(this);

        if (i < iconCount) {
            // This icon should be visible
            const isNew = i >= previousIconCount;
            const color = isNew ? dataPoint.color : getPreviousColor(i);

            icon.transition()
                .duration(isNew ? 800 : 0)
                .delay(isNew ? (i - previousIconCount) * 20 : 0)
                .style("opacity", 1)
                .attr("transform", function () {
                    const currentTransform = d3.select(this).attr("transform");
                    return currentTransform;
                });

            // Update fill color for the person icon path (both paths)
            icon.selectAll("path")
                .transition()
                .duration(isNew ? 800 : 0)
                .style("fill", color);
        } else {
            // Hide this icon
            icon.transition().duration(300).style("opacity", 0);
        }
    });
}

function getPreviousColor(iconIndex) {
    // Keep the color from the era where the icon first appeared (ascending)
    for (let i = 0; i < migrationData.length; i++) {
        if (iconIndex < migrationData[i].iconCount) {
            return migrationData[i].color;
        }
    }
    return migrationData[migrationData.length - 1].color;
}

function initMigrationScrollytelling() {
    // Load data and create visualization
    loadMigrationData().then((data) => {
        if (data.length === 0) {
            console.error("No migration data loaded");
            return;
        }

        migrationViz = createMigrationVisualization();

        if (!migrationViz) {
            console.error("Failed to create migration visualization");
            return;
        }

        // Initialize scrollama
        const scroller = scrollama();

        scroller
            .setup({
                step: "#migration-section .step",
                offset: 0.5,
                debug: false,
            })
            .onStepEnter((response) => {
                // Update active state
                document.querySelectorAll("#migration-section .step").forEach((step) => {
                    step.classList.remove("is-active");
                });
                response.element.classList.add("is-active");

                // Update visualization
                const year = parseInt(response.element.dataset.year, 10);
                updateMigrationViz(year);
            });

        // Handle window resize
        window.addEventListener("resize", () => {
            scroller.resize();
            // Optionally recreate viz on resize
            migrationViz = createMigrationVisualization();
            // Re-apply current state
            const activeStep = document.querySelector("#migration-section .step.is-active");
            if (activeStep) {
                const year = parseInt(activeStep.dataset.year, 10);
                updateMigrationViz(year);
            }
        });

        console.log("Migration scrollytelling initialized");
    });
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMigrationScrollytelling);
} else {
    initMigrationScrollytelling();
}
