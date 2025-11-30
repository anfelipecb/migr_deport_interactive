import polars as pl
from pathlib import Path

def analyze_data_for_viz():
    script_dir = Path(__file__).parent
    data_path = script_dir / "cleaned/unified_removals_with_geo.parquet"
    
    print(f"Loading data from {data_path}...")
    df = pl.read_parquet(data_path)
    
    total_rows = len(df)
    print(f"Total Removals: {total_rows}")

    # Check for records with Arrests (Origin)
    # We used 'has_arrest_record' flag in clean.py
    # But we also care if we successfully geocoded the Apprehension State
    
    # Filter for valid O-D pairs:
    # 1. Has Apprehension State (Origin)
    # 2. Has Departure Country (Destination)
    # 3. Both are geocoded
    
    valid_flow_df = df.filter(
        pl.col("apprehension_state_lat").is_not_null() & 
        pl.col("departure_country_lat").is_not_null()
    )
    
    flow_count = len(valid_flow_df)
    print(f"\nRecords with valid Origin-Destination coordinates: {flow_count} ({flow_count/total_rows:.1%})")
    
    # Check 'has_arrest_record' overlap
    arrest_flow_df = valid_flow_df.filter(pl.col("has_arrest_record"))
    print(f"Of those, records that explicitly linked to an Arrest ID: {len(arrest_flow_df)}")

    # Aggregation Analysis
    print("\n--- Aggregation Analysis ---")
    od_pairs = valid_flow_df.group_by([
        "Apprehension State", "Departure Country"
    ]).len().sort("len", descending=True)
    
    print(f"Unique O-D Pairs: {len(od_pairs)}")
    print("Top 10 O-D Pairs:")
    print(od_pairs.head(10))
    
    # Distribution of flow sizes
    print("\nFlow Size Distribution:")
    print(od_pairs["len"].describe())

    # Suggestion for aggregation
    if flow_count > 100000:
        print(f"\n[Recommendation] High volume ({flow_count}). Aggregation (e.g., 1 dot = 100 people) is recommended for performance.")
    else:
        print(f"\n[Recommendation] Moderate volume ({flow_count}). Individual points might be feasible with WebGL (MapLibre/Deck.gl).")

if __name__ == "__main__":
    analyze_data_for_viz()
