import polars as pl
import json
from pathlib import Path
from datetime import datetime

def load_data(file_path):
    """
    Loads Excel data using Polars with calamine engine.
    Skips initial rows to find the correct header.
    """
    print(f"Loading data from {file_path}...")
    try:
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

def extract_monthly_counts(
    df,
    date_col,
    identifier_col,
    event_type,
    start_date_filter=None,
    unique_ids_filter=None,
):
    """
    Extract monthly counts from a dataset, deduplicating by Unique Identifier.
    
    Args:
        df: Polars DataFrame
        date_col: Name of the date column
        identifier_col: Name of the unique identifier column
        event_type: Name of the event type (for logging)
        start_date_filter: Optional start date filter (YYYY-MM string)
        unique_ids_filter: Optional list of Unique Identifiers to filter by
    
    Returns:
        Dictionary with year-month as keys and counts as values
    """
    print(f"\nProcessing {event_type}...")
    
    # Select columns we need
    cols_to_select = [identifier_col, date_col]
    df_subset = df.select(cols_to_select)
    
    # Filter by Unique Identifier if provided
    if unique_ids_filter is not None:
        df_subset = df_subset.filter(pl.col(identifier_col).is_in(unique_ids_filter))
        print(f"  Filtered to {len(df_subset)} records matching provided Unique Identifiers")
    
    # Remove rows with null dates
    df_subset = df_subset.filter(pl.col(date_col).is_not_null())
    print(f"  Records with valid dates: {len(df_subset)}")
    
    # Convert to datetime
    df_subset = df_subset.with_columns([
        pl.col(date_col).cast(pl.Datetime).alias("date_dt")
    ])
    
    # Extract year-month as string "YYYY-MM"
    df_subset = df_subset.with_columns([
        pl.col("date_dt").dt.strftime("%Y-%m").alias("year_month")
    ])
    
    # Filter by start date if provided
    if start_date_filter:
        df_subset = df_subset.filter(pl.col("year_month") >= start_date_filter)
        print(f"  After filtering from {start_date_filter}: {len(df_subset)} records")
    
    # Aggregate by year-month (keeping all occurrences)
    monthly_counts = df_subset.group_by("year_month").len().sort("year_month")
    
    # Convert to dictionary
    result = {}
    for row in monthly_counts.iter_rows(named=True):
        result[row["year_month"]] = row["len"]
    
    if result:
        print(f"  Date range: {min(result.keys())} to {max(result.keys())}")
        print(f"  Total {event_type}: {sum(result.values()):,}")
    else:
        print(f"  No data after filtering")
    
    return result

def create_timeline_data():
    """
    Creates timeline data showing monthly counts of arrests, detentions, and removals.
    Generates both aggregated (all countries) and by-country data.
    """
    script_dir = Path(__file__).parent
    base_path = script_dir / "raw/ice_release_11aug2025_with_removals"
    output_dir = script_dir.parent / "www/data"
    output_path_all = output_dir / "timeline_data.json"
    output_path_by_country = output_dir / "timeline_data_by_country.json"
    
    # Load datasets
    arrests_path = base_path / "2025-ICLI-00019_2024-ICFO-39357_ERO Admin Arrests_LESA-STU_FINAL Redacted_raw.xlsx"
    removals_path = base_path / "2025-ICLI-00019_2024-ICFO-39357_ICE Removals_LESA-STU_FINAL Redacted_raw.xlsx"
    detentions_path = base_path / "2025-ICLI-00019_2024-ICFO-39357_ICE Detentions_LESA-STU_FINAL Redacted_raw.xlsx"
    
    print("Starting timeline data generation...")
    print("=" * 60)
    
    # Start date filter: September 2023
    start_date = "2023-09"
    
    # Load all datasets
    df_arrests = load_data(arrests_path)
    df_detentions = load_data(detentions_path)
    df_removals = load_data(removals_path)
    
    # Get unique countries from Removals (Citizenship Country)
    print("\nExtracting unique countries from Removals...")
    countries_df = df_removals.select(["Citizenship Country"]).filter(
        pl.col("Citizenship Country").is_not_null()
    ).unique()
    countries = sorted([row[0] for row in countries_df.iter_rows()])
    print(f"Found {len(countries)} unique countries")
    
    # ===== Generate aggregated data (all countries) =====
    print("\n" + "=" * 60)
    print("Generating aggregated data (all countries)...")
    print("=" * 60)
    
    arrests_monthly_all = extract_monthly_counts(
        df_arrests, 
        "Apprehension Date", 
        "Unique Identifier",
        "Arrests (All)",
        start_date_filter=start_date
    )
    
    detentions_monthly_all = extract_monthly_counts(
        df_detentions,
        "Book In Date Time",
        "Unique Identifier",
        "Detentions (All)",
        start_date_filter=start_date
    )
    
    removals_monthly_all = extract_monthly_counts(
        df_removals,
        "Departed Date",
        "Unique Identifier",
        "Removals (All)",
        start_date_filter=start_date
    )
    
    # Get all unique year-months across all three datasets
    all_months = set(arrests_monthly_all.keys()) | set(detentions_monthly_all.keys()) | set(removals_monthly_all.keys())
    all_months = sorted([m for m in all_months if m >= start_date])
    
    print(f"\nTotal unique months (from {start_date}): {len(all_months)}")
    if all_months:
        print(f"Date range: {all_months[0]} to {all_months[-1]}")
    
    # Create combined data array
    data_all = []
    for month in all_months:
        data_all.append({
            "date": month,
            "arrests": arrests_monthly_all.get(month, 0),
            "detentions": detentions_monthly_all.get(month, 0),
            "removals": removals_monthly_all.get(month, 0)
        })
    
    # Calculate totals
    totals_all = {
        "arrests": sum(arrests_monthly_all.values()),
        "detentions": sum(detentions_monthly_all.values()),
        "removals": sum(removals_monthly_all.values())
    }
    
    # Create output structure for all countries
    output_data_all = {
        "data": data_all,
        "dateRange": {
            "start": all_months[0] if all_months else start_date,
            "end": all_months[-1] if all_months else start_date
        },
        "totals": totals_all
    }
    
    # Save aggregated data
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"\nSaving aggregated timeline data to {output_path_all}...")
    with open(output_path_all, 'w') as f:
        json.dump(output_data_all, f, indent=2)
    
    print(f"Done. Generated {len(data_all)} monthly data points.")
    print(f"Totals - Arrests: {totals_all['arrests']:,}, Detentions: {totals_all['detentions']:,}, Removals: {totals_all['removals']:,}")
    
    # ===== Generate by-country data =====
    print("\n" + "=" * 60)
    print("Generating by-country data...")
    print("=" * 60)
    
    # Create a mapping of Unique Identifier to Citizenship Country from Removals
    print("\nCreating Unique Identifier to Country mapping...")
    removals_id_country = df_removals.select(["Unique Identifier", "Citizenship Country"]).filter(
        pl.col("Citizenship Country").is_not_null() & 
        pl.col("Unique Identifier").is_not_null()
    )
    print(f"  Mapped {len(removals_id_country)} Unique Identifiers to countries")
    
    # Process each country
    country_data = {}
    for i, country in enumerate(countries, 1):
        print(f"\n[{i}/{len(countries)}] Processing {country}...")
        
        # Get Unique Identifiers for this country
        country_ids = removals_id_country.filter(
            pl.col("Citizenship Country") == country
        ).select("Unique Identifier")
        country_id_list = country_ids["Unique Identifier"].to_list()
        
        if not country_id_list:
            print(f"  No Unique Identifiers found for {country}")
            continue
        
        print(f"  Found {len(country_id_list)} Unique Identifiers")
        
        # Extract monthly counts for this country
        arrests_monthly = extract_monthly_counts(
            df_arrests,
            "Apprehension Date",
            "Unique Identifier",
            f"Arrests ({country})",
            start_date_filter=start_date,
            unique_ids_filter=country_id_list
        )
        
        detentions_monthly = extract_monthly_counts(
            df_detentions,
            "Book In Date Time",
            "Unique Identifier",
            f"Detentions ({country})",
            start_date_filter=start_date,
            unique_ids_filter=country_id_list
        )
        
        removals_monthly = extract_monthly_counts(
            df_removals,
            "Departed Date",
            "Unique Identifier",
            f"Removals ({country})",
            start_date_filter=start_date,
            unique_ids_filter=country_id_list
        )
        
        # Get all unique year-months for this country
        country_months = set(arrests_monthly.keys()) | set(detentions_monthly.keys()) | set(removals_monthly.keys())
        country_months = sorted([m for m in country_months if m >= start_date])
        
        # Create data array for this country
        country_data_array = []
        for month in country_months:
            country_data_array.append({
                "date": month,
                "arrests": arrests_monthly.get(month, 0),
                "detentions": detentions_monthly.get(month, 0),
                "removals": removals_monthly.get(month, 0)
            })
        
        if country_data_array:
            country_data[country] = country_data_array
    
    # Create output structure for by-country data
    output_data_by_country = {
        "countries": countries,
        "data": country_data
    }
    
    # Save by-country data
    print(f"\nSaving by-country timeline data to {output_path_by_country}...")
    with open(output_path_by_country, 'w') as f:
        json.dump(output_data_by_country, f, indent=2)
    
    print(f"Done. Generated data for {len(country_data)} countries.")
    
    return output_data_all, output_data_by_country

if __name__ == "__main__":
    create_timeline_data()
