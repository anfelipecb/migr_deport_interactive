// Timeline Visualization for Arrests, Detentions, and Removals
// Shows monthly counts over time with progressive animation, country filtering, and scrollama integration

// SVG dimensions
const timelineWidth = 1000;
const timelineHeight = 500;
const timelineMargin = { top: 40, right: 80, bottom: 50, left: 80 }; // Reduced bottom margin

// Color scheme matching Sankey diagram
const timelineColors = {
    'arrests': '#FF6B6B',      // Red
    'detentions': '#4ECDC4',   // Teal/Cyan
    'removals': '#C8A2C8'      // Light Purple
};

// Global variables
let timelineDataAll = null;
let timelineDataByCountry = null;
let currentCountry = 'all';
let timelineSvg = null;
let timelineG = null;
let trumpMarkerLine = null;
let trumpMarkerLabel = null;
let trumpMarkerVisible = false;

// Trump inauguration date: January 20, 2025
const trumpInaugurationDate = new Date(2025, 0, 20); // Month is 0-indexed

// Initialize timeline
async function initTimeline() {
    try {
        // Load both data files
        const [responseAll, responseByCountry] = await Promise.all([
            fetch('data/timeline_data.json'),
            fetch('data/timeline_data_by_country.json')
        ]);
        
        if (!responseAll.ok || !responseByCountry.ok) {
            throw new Error(`HTTP error! status: ${responseAll.status} or ${responseByCountry.status}`);
        }
        
        timelineDataAll = await responseAll.json();
        timelineDataByCountry = await responseByCountry.json();
        
        console.log('Timeline data loaded:', timelineDataAll);
        console.log('By-country data loaded:', timelineDataByCountry);
        
        if (!timelineDataAll.data || timelineDataAll.data.length === 0) {
            console.error('No data in timeline');
            document.getElementById('timeline-viz').innerHTML = 
                '<p>Error: No data available.</p>';
            return;
        }
        
        // Populate country filter dropdown
        populateCountryFilter();
        
        // Render the timeline with all countries
        renderTimeline('all');
        
        // Initialize scrollama for timeline
        initTimelineScrollama();
        
    } catch (error) {
        console.error('Error loading timeline data:', error);
        document.getElementById('timeline-viz').innerHTML = 
            '<p>Error loading data. Please ensure timeline data files exist.</p>';
    }
}

function populateCountryFilter() {
    const select = document.getElementById('country-select');
    if (!select) return;
    
    // Add "All Countries" option
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Countries';
    select.appendChild(allOption);
    
    // Add country options
    if (timelineDataByCountry && timelineDataByCountry.countries) {
        timelineDataByCountry.countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            select.appendChild(option);
        });
    }
    
    // Add change event listener
    select.addEventListener('change', (e) => {
        currentCountry = e.target.value;
        renderTimeline(currentCountry);
    });
}

function renderTimeline(country = 'all') {
    // Get data based on country filter
    let data;
    if (country === 'all') {
        data = timelineDataAll;
    } else {
        // Get country-specific data
        if (timelineDataByCountry && timelineDataByCountry.data[country]) {
            data = {
                data: timelineDataByCountry.data[country],
                dateRange: timelineDataAll.dateRange,
                totals: {
                    arrests: timelineDataByCountry.data[country].reduce((sum, d) => sum + d.arrests, 0),
                    detentions: timelineDataByCountry.data[country].reduce((sum, d) => sum + d.detentions, 0),
                    removals: timelineDataByCountry.data[country].reduce((sum, d) => sum + d.removals, 0)
                }
            };
        } else {
            console.warn(`No data for country: ${country}`);
            data = timelineDataAll;
        }
    }
    
    // Clear container
    const container = d3.select('#timeline-viz');
    container.selectAll('*').remove();
    trumpMarkerVisible = false;
    trumpMarkerLine = null;
    trumpMarkerLabel = null;
    
    // Create SVG
    timelineSvg = container.append('svg')
        .attr('width', timelineWidth)
        .attr('height', timelineHeight);
    
    // Create main group
    timelineG = timelineSvg.append('g')
        .attr('transform', `translate(${timelineMargin.left},${timelineMargin.top})`);
    
    const chartWidth = timelineWidth - timelineMargin.left - timelineMargin.right;
    const chartHeight = timelineHeight - timelineMargin.top - timelineMargin.bottom;
    
    // Parse dates and filter to start from September 2023
    const parseDate = d3.timeParse('%Y-%m');
    const startDate2023_09 = parseDate('2023-09');
    const dataParsed = data.data.map(d => ({
        date: parseDate(d.date),
        arrests: d.arrests,
        detentions: d.detentions,
        removals: d.removals
    })).filter(d => d.date !== null && d.date >= startDate2023_09);
    
    if (dataParsed.length === 0) {
        container.append('p').text('No data available for the selected country.');
        return;
    }
    
    // Find max value across all series for y-axis
    const maxValue = d3.max(dataParsed, d => 
        Math.max(d.arrests, d.detentions, d.removals)
    );
    
    // Create scales
    const xScale = d3.scaleTime()
        .domain(d3.extent(dataParsed, d => d.date))
        .range([0, chartWidth]);
    
    const yScale = d3.scaleLinear()
        .domain([0, maxValue * 1.1]) // Add 10% padding at top
        .range([chartHeight, 0]);
    
    // Create line generators
    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);
    
    // Prepare data for each series
    const arrestsData = dataParsed.map(d => ({ date: d.date, value: d.arrests }));
    const detentionsData = dataParsed.map(d => ({ date: d.date, value: d.detentions }));
    const removalsData = dataParsed.map(d => ({ date: d.date, value: d.removals }));
    
    // Create axes
    const xAxis = d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat('%Y-%m'))
        .ticks(d3.timeMonth.every(3)); // Show every 3 months
    
    const yAxis = d3.axisLeft(yScale)
        .tickFormat(d => d.toLocaleString());
    
    // Draw axes
    timelineG.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${chartHeight})`)
        .call(xAxis)
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .attr('dx', '-0.5em')
        .attr('dy', '0.5em')
        .style('text-anchor', 'end');
    
    timelineG.append('g')
        .attr('class', 'y-axis')
        .call(yAxis);
    
    // Add axis labels - fixed spacing
    timelineG.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -50)
        .attr('x', -chartHeight / 2)
        .attr('text-anchor', 'middle')
        .text('Number of Events');
    
    // X-axis label with reduced spacing
    timelineG.append('text')
        .attr('class', 'axis-label')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + 50})`)
        .attr('text-anchor', 'middle')
        .text('Date (Year-Month)');
    
    // Create line paths (initially hidden)
    const arrestsLine = timelineG.append('path')
        .datum(arrestsData)
        .attr('class', 'timeline-line arrests-line')
        .attr('d', line)
        .attr('fill', 'none')
        .attr('stroke', timelineColors.arrests)
        .attr('stroke-width', 2.5)
        .attr('opacity', 0.9);
    
    const detentionsLine = timelineG.append('path')
        .datum(detentionsData)
        .attr('class', 'timeline-line detentions-line')
        .attr('d', line)
        .attr('fill', 'none')
        .attr('stroke', timelineColors.detentions)
        .attr('stroke-width', 2.5)
        .attr('opacity', 0.9);
    
    const removalsLine = timelineG.append('path')
        .datum(removalsData)
        .attr('class', 'timeline-line removals-line')
        .attr('d', line)
        .attr('fill', 'none')
        .attr('stroke', timelineColors.removals)
        .attr('stroke-width', 2.5)
        .attr('opacity', 0.9);
    
    // Animate lines progressively
    const animateLine = (lineElement, delay = 0) => {
        const totalLength = lineElement.node().getTotalLength();
        
        lineElement
            .attr('stroke-dasharray', totalLength + ' ' + totalLength)
            .attr('stroke-dashoffset', totalLength)
            .transition()
            .duration(3500)
            .delay(delay)
            .ease(d3.easeLinear)
            .attr('stroke-dashoffset', 0);
    };
    
    // Animate each line with slight stagger
    animateLine(arrestsLine, 0);
    animateLine(detentionsLine, 500);
    animateLine(removalsLine, 1000);
    
    // Add circles for data points (for tooltips)
    const createCircles = (data, className, color) => {
        const circles = timelineG.selectAll(`.${className}`)
            .data(data)
            .enter()
            .append('circle')
            .attr('class', className)
            .attr('cx', d => xScale(d.date))
            .attr('cy', d => yScale(d.value))
            .attr('r', 0)
            .attr('fill', color)
            .attr('opacity', 0.7)
            .on('mouseover', function(event, d) {
                // Show tooltip
                const tooltip = d3.select('body').selectAll('.timeline-tooltip')
                    .data([null])
                    .join('div')
                    .attr('class', 'timeline-tooltip')
                    .style('opacity', 0);
                
                tooltip.transition()
                    .duration(200)
                    .style('opacity', 1);
                
                tooltip.html(`
                    <strong>${d3.timeFormat('%Y-%m')(d.date)}</strong><br/>
                    ${className.replace('-circle', '')}: ${d.value.toLocaleString()}
                `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
            })
            .on('mouseout', function() {
                d3.select('.timeline-tooltip')
                    .transition()
                    .duration(200)
                    .style('opacity', 0)
                    .remove();
            });
        
        // Animate circles appearing
        circles.transition()
            .delay((d, i) => 3500 + (i * 20))
            .duration(300)
            .attr('r', 3);
    };
    
    createCircles(arrestsData, 'arrests-circle', timelineColors.arrests);
    createCircles(detentionsData, 'detentions-circle', timelineColors.detentions);
    createCircles(removalsData, 'removals-circle', timelineColors.removals);
    
    // Create legend
    const legend = timelineSvg.append('g')
        .attr('class', 'timeline-legend')
        .attr('transform', `translate(${timelineWidth - timelineMargin.right - 150}, ${timelineMargin.top + 20})`);
    
    const legendData = [
        { label: 'Arrests', color: timelineColors.arrests },
        { label: 'Detentions', color: timelineColors.detentions },
        { label: 'Removals', color: timelineColors.removals }
    ];
    
    const legendItems = legend.selectAll('.legend-item')
        .data(legendData)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => `translate(0, ${i * 25})`);
    
    legendItems.append('line')
        .attr('x1', 0)
        .attr('x2', 20)
        .attr('y1', 0)
        .attr('y2', 0)
        .attr('stroke', d => d.color)
        .attr('stroke-width', 2.5);
    
    legendItems.append('text')
        .attr('x', 25)
        .attr('y', 4)
        .attr('fill', '#333')
        .style('font-size', '14px')
        .text(d => d.label);
    
    // Store scales for Trump marker
    window.timelineXScale = xScale;
    window.timelineYScale = yScale;
    window.timelineChartHeight = chartHeight;
}

function drawTrumpMarker() {
    if (trumpMarkerVisible) return;
    if (!timelineG || !window.timelineXScale || !window.timelineYScale) return;
    
    const xScale = window.timelineXScale;
    const yScale = window.timelineYScale;
    const chartHeight = window.timelineChartHeight;
    
    // Check if date is within domain
    const domain = xScale.domain();
    if (trumpInaugurationDate < domain[0] || trumpInaugurationDate > domain[1]) {
        return; // Date not in visible range
    }
    
    const xPos = xScale(trumpInaugurationDate);
    
    // Draw vertical line
    trumpMarkerLine = timelineG.append('line')
        .attr('class', 'trump-marker-line')
        .attr('x1', xPos)
        .attr('x2', xPos)
        .attr('y1', 0)
        .attr('y2', chartHeight)
        .attr('stroke', '#FFA500')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
        .attr('opacity', 0)
        .transition()
        .duration(500)
        .attr('opacity', 0.8);
    
    // Add label
    trumpMarkerLabel = timelineG.append('text')
        .attr('class', 'trump-marker-label')
        .attr('x', xPos)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('fill', '#FFA500')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('opacity', 0)
        .text('Trump Inauguration')
        .transition()
        .duration(500)
        .attr('opacity', 1);
    trumpMarkerVisible = true;
}

function initTimelineScrollama() {
    const scroller = scrollama();
    
    scroller
        .setup({
            step: '#timeline-section .step',
            offset: 0.5, // Standard offset for proper step movement
            debug: false
        })
        .onStepEnter((response) => {
            // Remove active class from all steps
            document.querySelectorAll('#timeline-section .step').forEach(step => {
                step.classList.remove('is-active');
            });
            
            // Add active class to current step
            response.element.classList.add('is-active');
            
            // Hide filter while reading cards
            const filter = document.getElementById('timeline-filter');
            if (filter && response.index <= 1) {
                filter.classList.remove('visible');
            }
            
            // Step 2: Show Trump marker
            if (response.index === 1) { // Step 2 is index 1
                drawTrumpMarker();
            }
            
        })
        .onStepExit((response) => {
            // After Step 2 (index 1) exits, show the filter
            if (response.index === 1) {
                const filter = document.getElementById('timeline-filter');
                if (filter) {
                    filter.classList.add('visible');
                }
            }
        });
    
    // Setup intersection observer to hide filter when timeline section is not visible
    setupTimelineFilterVisibility();
}

// Hide filter when timeline section is not visible
function setupTimelineFilterVisibility() {
    const timelineSection = document.getElementById('timeline-section');
    const filter = document.getElementById('timeline-filter');
    
    if (!timelineSection || !filter) return;
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                // Timeline section is not visible, hide filter
                filter.classList.remove('visible');
            }
        });
    }, {
        threshold: 0.1 // Trigger when less than 10% of section is visible
    });
    
    observer.observe(timelineSection);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTimeline);
} else {
    initTimeline();
}
