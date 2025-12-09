"""
Extract migration data from MPI Excel file for visualization.
Creates migration_data.json in the www/data/ directory.
"""

import polars as pl
from pathlib import Path
import json


def create_migration_data():
    """
    Extracts migration data from MPI Excel file for visualization.
    Creates JSON file with historical immigrant population data.
    """
    script_dir = Path(__file__).parent.parent
    mpi_path = script_dir / "raw/MPI-Data-Hub_Imm_N-Percent-US-Pop_2023.xlsx"
    
    print(f"Loading MPI migration data from {mpi_path}...")
    
    try:
        # Read the MPI Excel file
        df = pl.read_excel(mpi_path, engine="calamine")
        col_year, col_pop, col_pct = df.columns

        # Clean and convert; drop the header row by keeping numeric years
        clean = (
            df.rename({col_year: "year", col_pop: "population", col_pct: "percentage"})
            .with_columns(
                [
                    pl.col("year")
                    .cast(pl.Utf8)
                    .str.replace_all(r"[^0-9]", "")
                    .cast(pl.Int64, strict=False)
                    .alias("year"),
                    pl.col("population")
                    .cast(pl.Utf8)
                    .str.replace_all(r"[^0-9]", "")
                    .cast(pl.Int64, strict=False)
                    .alias("population"),
                    pl.col("percentage")
                    .cast(pl.Utf8)
                    .str.strip_chars()
                    .cast(pl.Float64, strict=False)
                    .alias("percentage"),
                ]
            )
            .filter(pl.col("year").is_not_null())
        )

        # Target years (Excel up to 2023) + manual 2024 point
        targets = [1850, 1960, 2010, 2023]
        colors = {
            1850: "#edbe62",
            1960: "#087e8b",
            2010: "#fdb7b9",
            2023: "#c81d25",  # align 2023 with final era color
            2024: "#c81d25",
        }

        # 1 icon = 200,000 people
        def icon_count(pop):
            return int((pop + 199_999) // 200_000)

        filtered = clean.filter(pl.col("year").is_in(targets)).to_dicts()
        print(f"Filtered rows count: {len(filtered)}")

        migration_data = []
        for row in filtered:
            year = int(row["year"])
            pop = int(row["population"])
            pct = float(row["percentage"])
            migration_data.append(
                {
                    "year": year,
                    "population": pop,
                    "percentage": pct,
                    "iconCount": icon_count(pop),
                    "color": colors.get(year, "#ccc"),
                }
            )

        # Manually append 2024 point (not in Excel)
        migration_data.append(
            {
                "year": 2024,
                "population": 50_234_900,
                "percentage": 0.148,
                "iconCount": icon_count(50_234_900),
                "color": colors.get(2024, "#E74C3C"),
            }
        )

        # Sort by year
        migration_data.sort(key=lambda x: x["year"])
        
        # Save to JSON in www/data directory
        output_dir = script_dir.parent / "www" / "data"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "migration_data.json"
        
        print(f"Saving migration data to {output_path}...")
        with open(output_path, 'w') as f:
            json.dump(migration_data, f, indent=2)
        
        print("Migration data saved successfully!")
        print(f"Created data for {len(migration_data)} time periods")
        
    except Exception as e:
        print(f"Error processing MPI data: {e}")
        raise


if __name__ == "__main__":
    create_migration_data()

