# In and Out: a Scrolly telling about recent Migrations and Deportations in the U.S.

Andrés Felipe Camacho

## Description

In and Out is an interactive data visualization that explores immigration and deportation patterns in the United States. The project presents a comprehensive scrollytelling narrative that traces the journey of individuals through the immigration enforcement system, from historical immigration trends to current deportation flows.

The visualization consists of multiple interconnected sections:
- **Historical Migration**: An animated timeline showing the growth of the foreign-born population in the United States from 1850 to 2024
- **The Deportation Pipeline**: A Sankey diagram illustrating the flow of individuals through ICE's enforcement process (arrests, detentions, and removals)
- **Timeline of Deportations**: Monthly counts of enforcement actions over time, with country-specific filtering
- **Removal Flows Map**: An interactive world map showing the geographic flows of removals from U.S. states to destination countries, with particle animations representing individual journeys
- **Detention Journeys**: A detailed exploration of the complex network of detention facility transfers within the United States, highlighting individual stories and facility statistics

The project uses scrollytelling techniques to guide users through the data, with interactive elements that allow exploration of specific patterns and stories. Particle animations, map visualizations, and statistical summaries work together to humanize the data and reveal the scale and complexity of immigration enforcement.



## Data Sources

**Arrests, Detentions, and Removals**: Data provided by the [Deportation Data Project](https://deportationdata.org/data/ice.html), which obtains ICE enforcement data through FOIA requests. This visualization uses data covering September 2023 to July 2025, including arrests, detention records, and removal flows. ICE enforcement data should be cited as "government data provided by ICE in response to a FOIA request to the Deportation Data Project."

**Historical Immigration Population**: Data from the [Migration Policy Institute Data Hub](https://www.migrationpolicy.org/programs/data-hub/charts/immigrant-population-over-time), showing the foreign-born population in the United States from 1850 to 2024. The Migration Policy Institute data represents estimates of the foreign-born population based on U.S. Census and American Community Survey data.

**Detention Facilities**: Geographic coordinates and facility information from the [Vera Institute of Justice ICE Detention Trends repository](https://github.com/vera-institute/ice-detention-trends), which provides facility metadata including facility codes, names, locations, and types. The data was matched to detention records by facility code.

## Folder Structure

```
migr_deport_interactive/
├── data/
│   ├── processing/          # Data processing modules
│   │   ├── clean_ice.py
│   │   ├── clean_migration.py
│   │   ├── geocode.py
│   │   ├── aggregate_flows.py
│   │   ├── create_sankey.py
│   │   ├── create_timeline.py
│   │   └── create_detention_journey.py
│   ├── main_clean.py        # Main orchestrator script
│   ├── raw/                  # Raw data files (must be downloaded)
│   │   ├── ice_release_11aug2025_with_removals/
│   │   │   ├── 2025-ICLI-00019_2024-ICFO-39357_ERO Admin Arrests_LESA-STU_FINAL Redacted_raw.xlsx
│   │   │   ├── 2025-ICLI-00019_2024-ICFO-39357_ICE Detentions_LESA-STU_FINAL Redacted_raw.xlsx
│   │   │   └── 2025-ICLI-00019_2024-ICFO-39357_ICE Removals_LESA-STU_FINAL Redacted_raw.xlsx
│   │   ├── facilities.csv
│   │   └── MPI-Data-Hub_Imm_N-Percent-US-Pop_2023.xlsx
│   └── cleaned/              # Intermediate processed data (generated)
│       ├── unified_removals.parquet
│       ├── unified_removals_with_geo.parquet
│       └── location_cache.json
├── www/                      # Frontend visualization
│   ├── index.html
│   ├── style.css
│   ├── main.js
│   ├── migration.js
│   ├── timeline.js
│   ├── sankey.js
│   ├── detention_journey.js
│   ├── data/                 # Visualization data files (generated)
│   │   ├── migration_data.json
│   │   ├── sankey_data.json
│   │   ├── timeline_data.json
│   │   ├── timeline_data_by_country.json
│   │   ├── flow_data.json
│   │   ├── top_destinations.json
│   │   ├── detention_flows.json
│   │   ├── detention_highlights.json
│   │   └── detention_statistics.json
│   └── imgs/                 # Images and assets
├── pyproject.toml
├── uv.lock
└── README.md
```

## Setup Instructions

### Prerequisites

- Python 3.10-3.12
- [uv](https://github.com/astral-sh/uv) package manager

### Installation

1. Install dependencies:
   ```bash
   uv sync
   ```

2. Download required data files to `data/raw/`:
   - **ICE Data**: Download the ICE release data from the Deportation Data Project and extract to `data/raw/ice_release_11aug2025_with_removals/`
   - **Facilities Data**: Download `facilities.csv` from the [Vera Institute repository](https://github.com/vera-institute/ice-detention-trends) and place in `data/raw/facilities.csv`
   - **Migration Data**: Download the MPI Excel file and place as `data/raw/MPI-Data-Hub_Imm_N-Percent-US-Pop_2023.xlsx`

### Data Processing

Run the main data processing pipeline:

```bash
uv run data/main_clean.py
```

This will execute all processing steps in order:
1. Clean and merge ICE data (Arrests, Removals, Detentions)
2. Create migration data from MPI Excel file
3. Geocode locations in the unified removals dataset
4. Aggregate flows for the removal flows map
5. Create Sankey diagram data
6. Create timeline data
7. Create detention journey data

All output files will be generated in `www/data/`.

**Note**: The geocoding step may take a while as it uses the Nominatim geocoding service with rate limiting. Results are cached in `data/cleaned/location_cache.json` to speed up subsequent runs.

### Running the Visualization

Once data processing is complete, serve the `www/` directory with a local web server:

**Using Python's built-in server:**
```bash
cd www
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

**Using uvx (if you have it installed):**
```bash
uvx livereload
```
