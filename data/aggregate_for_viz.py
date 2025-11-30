import polars as pl
import json
from pathlib import Path

def aggregate_data():
    script_dir = Path(__file__).parent
    data_path = script_dir / "cleaned/unified_removals_with_geo.parquet"
    # Output to www/data for the frontend
    output_dir = script_dir.parent / "www/data"
    output_path = output_dir / "flow_data.json"
    
    print(f"Loading data from {data_path}...")
    df = pl.read_parquet(data_path)
    
    # Filter for valid O-D pairs (lat/lon not null)
    # We use the columns created by geocode.py
    # Origin: Apprehension State -> apprehension_state_lat, apprehension_state_lon
    # Destination: Departure Country -> departure_country_lat, departure_country_lon
    
    valid_flow_df = df.filter(
        pl.col("apprehension_state_lat").is_not_null() & 
        pl.col("departure_country_lat").is_not_null()
    )
    
    print(f"Valid records for flow: {len(valid_flow_df)}")
    
    # Group by Origin and Destination
    # We include the coordinates in the group by to keep them in the result
    # (They should be unique per name anyway)
    aggregated = valid_flow_df.group_by([
        "Apprehension State", "apprehension_state_lat", "apprehension_state_lon",
        "Departure Country", "departure_country_lat", "departure_country_lon"
    ]).len().sort("len", descending=True)
    
    print(f"Unique Flows: {len(aggregated)}")
    
    # Prepare JSON structure
    flows = []
    scale_factor = 100 # 1 particle = 100 people
    
    for row in aggregated.iter_rows(named=True):
        count = row["len"]
        scaled_count = max(1, round(count / scale_factor)) # Ensure at least 1 particle if flow exists? Or maybe 0 if < 50?
        # Let's say at least 1 if count > 0
        
        flow = {
            "origin": {
                "name": row["Apprehension State"].title() if row["Apprehension State"] else "Unknown",
                "lat": row["apprehension_state_lat"],
                "lon": row["apprehension_state_lon"]
            },
            "destination": {
                "name": row["Departure Country"].title() if row["Departure Country"] else "Unknown",
                "lat": row["departure_country_lat"],
                "lon": row["departure_country_lon"]
            },
            "count": count,
            "scaled_count": scaled_count
        }
        flows.append(flow)
    
    # Save to JSON
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Saving {len(flows)} flows to {output_path}...")
    with open(output_path, 'w') as f:
        json.dump(flows, f, indent=2)
    
    print("Done.")

if __name__ == "__main__":
    aggregate_data()
