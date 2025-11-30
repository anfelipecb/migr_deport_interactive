import polars as pl
from pathlib import Path

def check_visualization_data():
    script_dir = Path(__file__).parent
    data_path = script_dir / "cleaned/unified_removals_with_geo.parquet"
    
    print(f"Loading data from {data_path}...")
    df = pl.read_parquet(data_path)
    
    print("Columns:", df.columns)
    
    # Check for coordinates
    # Based on geocode.py: {col}_lat, {col}_lon
    # Target cols were: "Port of Departure", "Departure Country", "Apprehension State"
    # So we expect: port_of_departure_lat, departure_country_lat, apprehension_state_lat, etc.
    
    # Aggregate O-D pairs (Apprehension State -> Departure Country)
    od_pairs = df.group_by([
        "Apprehension State", "apprehension_state_lat", "apprehension_state_lon",
        "Departure Country", "departure_country_lat", "departure_country_lon"
    ]).len().sort("len", descending=True)
    
    print(f"\nTotal O-D Pairs: {len(od_pairs)}")
    print("Top 10 O-D Pairs:")
    print(od_pairs.head(10))
    
    # Check how many have valid coordinates
    valid_od = od_pairs.drop_nulls([
        "apprehension_state_lat", "apprehension_state_lon",
        "departure_country_lat", "departure_country_lon"
    ])
    print(f"\nO-D Pairs with valid coordinates: {len(valid_od)}")

if __name__ == "__main__":
    check_visualization_data()
