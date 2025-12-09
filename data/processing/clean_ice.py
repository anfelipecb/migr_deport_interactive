"""
Clean and merge ICE data (Arrests, Removals, Detentions).
Creates unified_removals.parquet in the cleaned/ directory.
"""

import polars as pl
from pathlib import Path


def load_data(file_path):
    """
    Loads Excel data using Polars with calamine engine.
    Skips initial rows to find the correct header.
    """
    print(f"Loading data from {file_path}...")
    try:
        # Based on exploration, header is at row index 6 (7th row)
        df = pl.read_excel(
            file_path,
            read_options={"header_row": 6},
            engine="calamine"
        )
        print(f"Successfully loaded {len(df)} rows.")
        return df
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        raise


def clean_and_merge():
    """
    Reads Arrests, Removals, and Detentions data.
    Merges them into a unified dataset based on Removals.
    Fills missing Apprehension State in Removals from Arrests.
    Saves the result to Parquet.
    """
    # Use the script's location to determine paths
    script_dir = Path(__file__).parent.parent
    base_path = script_dir / "raw/ice_release_11aug2025_with_removals"
    
    arrests_path = base_path / "2025-ICLI-00019_2024-ICFO-39357_ERO Admin Arrests_LESA-STU_FINAL Redacted_raw.xlsx"
    removals_path = base_path / "2025-ICLI-00019_2024-ICFO-39357_ICE Removals_LESA-STU_FINAL Redacted_raw.xlsx"
    detentions_path = base_path / "2025-ICLI-00019_2024-ICFO-39357_ICE Detentions_LESA-STU_FINAL Redacted_raw.xlsx"

    # Load datasets
    print("Starting data loading process...")
    df_arrests = load_data(arrests_path)
    df_removals = load_data(removals_path)
    df_detentions = load_data(detentions_path)

    # Prepare Arrests for merge (select relevant columns to avoid duplication)
    # We need Unique Identifier and Apprehension State from Arrests
    # Rename Apprehension State to avoid collision before coalescing
    arrests_subset = df_arrests.select([
        pl.col("Unique Identifier"),
        pl.col("Apprehension State").alias("Apprehension State_Arrests")
    ])

    # Prepare Detentions for merge (just to check existence for now)
    detentions_subset = df_detentions.select([
        pl.col("Unique Identifier")
    ]).with_columns(pl.lit(True).alias("has_detention_record"))

    print("Merging datasets...")
    
    # Start with Removals
    df_unified = df_removals

    # Merge Arrests (Left Join)
    df_unified = df_unified.join(
        arrests_subset,
        on="Unique Identifier",
        how="left"
    )

    # Merge Detentions (Left Join)
    df_unified = df_unified.join(
        detentions_subset,
        on="Unique Identifier",
        how="left"
    )

    # Create flags
    df_unified = df_unified.with_columns([
        pl.col("Apprehension State_Arrests").is_not_null().alias("has_arrest_record"),
        pl.col("has_detention_record").fill_null(False)
    ])

    # Fill Apprehension State in Removals from Arrests if missing
    # If "Apprehension State" in Removals is null, take "Apprehension State_Arrests"
    df_unified = df_unified.with_columns(
        pl.col("Apprehension State").fill_null(pl.col("Apprehension State_Arrests"))
    )

    # Drop the temporary column
    df_unified = df_unified.drop("Apprehension State_Arrests")

    print(f"Unified dataset has {len(df_unified)} rows.")

    # Save to Parquet
    output_dir = script_dir / "cleaned"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "unified_removals.parquet"
    
    print(f"Saving unified data to {output_path}...")
    df_unified.write_parquet(output_path)
    print("Done.")


if __name__ == "__main__":
    clean_and_merge()

