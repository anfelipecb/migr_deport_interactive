# Andrés Felipe Camacho

Andres Felipe Camacho Baquero

## Description

This project is a two-part, map-driven interactive that places U.S. migration inflows and interior enforcement/deportations on a single, comprehensible timeline. Part 1 (Inflows) visualizes lawful admissions (lawful permanent residents, I-94 nonimmigrants, refugees/asylees) alongside border/port encounters as a proxy for irregular inflows. Users scrub a timeline to watch country-to-U.S. particle flows accumulate and compare categories in a linked chart. The inflow backbone comes from the DHS OHSS Yearbook/Annual Flow reports for lawful categories and the CBP Nationwide Encounters monthly series for attempted entries. The intent is clarity: distinguish entries/admissions from encounters and communicate differences in cadence (annual vs. monthly) while keeping both on the same FY axis.  ￼

Part 2 (Interior enforcement & deportations) animates the pipeline arrest → detention (by facility) → removal (destination country). Observed events from the Deportation Data Project’s ICE FOIA releases drive arrest timing, nationality mix, and outcomes where linkable; Vera’s Detention Trends provide geocoded facilities and daily populations that bound capacity and flow rates. The animation is intentionally explanatory rather than predictive: a stylized stock-and-flow that respects known caveats (e.g., linkage gaps, duplicates, and table coverage). The narrative shows where people are arrested (AOR/state), how detention loads move through facilities, and where removals go.  ￼ ￼

The overall goal is to tell a cohesive story: inflows into the country in Part 1, and what happens inside the country in Part 2. Visual design draws on two proven patterns—Lucify’s moving-particle migration map and the New York Times’ progressive, time-scrubbed geographic narrative—adapted to U.S. datasets and definitions.

## Technical Plan re: Option A/B/C/D

Chosen path: Option D: Custom simulation flow + Geospatial Visualization with a custom D3 view . 
The code is a in cascade Narrative + MapLibre GL map + D3 v7 for a linked Sankey/stacked-area chart. The map hosts a custom Canvas layer for particle/arc animation (arrest → facility → removal).  ￼

UI and Interactions. A top-right panel provides a Part toggle (“Inflows” vs. “Enforcement & Deportations”), filters (AOR/state, nationality, category, facility type), and small metrics (current arrests/detentions/removals; top destinations). A time slider supports drag + play/pause; the D3 view stays linked to map selections (e.g., brushing AORs or clicking facilities).


## Inspirations
A lot of inspirations
    - I really want to replicate this: NYT – How the Virus Got Out (stepwise temporal narrative + scrollytelling over geography [here](https://www.nytimes.com/interactive/2020/03/22/world/coronavirus-spread.html)
    - Lucify – The Flow towards Europe (animated particle flows + timeline and linked totals): love thos movements data [here](https://www.lucify.com/the-flow-towards-europe/)
    - I have always be inspired by this and want to create a similar "narrative" as in this project [HumanReach](https://storymaps.arcgis.com/stories/2f289f1a06ba4f2d95b3fbf3133c50f9)

## Mockup

See the wireframe image for layout: main MapLibre panel (flows + facilities), right control panel (filters, scenario toggles, metrics), bottom time slider, and a linked D3 chart. But as is two parts, I imagine a narrative where the users starts scrolling down and see 1 the simulations until it reaches the map with movement (like lucidy)
See (print1.pdf) for a general initial idea I was drawing and this for a module specialized after the narrative:
![Interactiveidea](./interactive-migration-mockup.png)

## Data Sources

Data Source 1: DHS OHSS — Yearbook & Annual Flow Reports (Inflows)

URL: https://ohss.dhs.gov/topics/immigration/yearbook
Size: Annual tables (varies by table; typically tens to hundreds of rows/columns per FY).
Description: Authoritative counts for LPR admissions, I-94 nonimmigrant admissions, and refugee/asylee flows used to construct the lawful inflow series (annual, with monthly detail where available in companion reports). These define categories and avoid conflating admissions with encounters.  ￼

Data Source 2: U.S. Customs and Border Protection — Nationwide Encounters (Monthly)

URL: https://www.cbp.gov/document/stats/nationwide-encounters
Size: Monthly CSVs (FY22–FY25 by state/AOR; multi-MB).
Description: Encounters (USBP Title 8 apprehensions, OFO Title 8 inadmissibles, Title 42 where applicable) by sector/port used as a monthly proxy for attempted irregular inflows. This complements lawful admissions in Part 1 and aligns naturally to the time slider.  ￼

Data Source 3: Deportation Data Project (ICE FOIA) + Vera Institute (Detention Trends)

URLs: https://deportationdata.org/data/ice.html and https://www.vera.org/ice-detention-trends
Size: DDP provides large individual-level tables for encounters, detainers, arrests, detentions, removals (2023–2025 releases); Vera provides daily national and facility-level detention series and geocoded facility metadata (≈1,300+ facilities).
Description: Together, these power Part 2. DDP’s person-level records provide event timing and attributes, while Vera bounds flows with daily populations and facility context; both projects document important caveats (e.g., linkage gaps, duplicates, and facility coding nuances) that will be summarized in a methods note.  ￼

## Questions
	1.	Interactivity requirement: I am not sure if its actually option D, because I will use map but also rely on a interactive simulate narrative
	2.	Scope: Do you think I should think about a narrative around the topics from now, like migration vs deportation to show how people are experiencing this?
    3. I am not sure how big of a work is this, should I reduce ambitions to achieve?