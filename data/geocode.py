import polars as pl
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from pathlib import Path
import json
import time

def get_unique_locations(df, columns):
    """
    Extracts unique values from specified columns.
    Returns a set of unique location strings.
    """
    unique_locs = set()
    for col in columns:
        if col in df.columns:
            # Drop nulls and convert to list
            locs = df[col].drop_nulls().unique().to_list()
            unique_locs.update(locs)
    return unique_locs

def load_cache(cache_path):
    if cache_path.exists():
        with open(cache_path, 'r') as f:
            return json.load(f)
    return {}

def save_cache(cache, cache_path):
    with open(cache_path, 'w') as f:
        json.dump(cache, f, indent=4)

def clean_location_name(loc):
    """
    Cleans location name to improve geocoding success.
    """
    if not isinstance(loc, str):
        return loc
    
    # Remove common suffixes
    loc = loc.replace(", POE", "")
    loc = loc.replace(" - PRECLEARANCE", "")
    loc = loc.replace(" POE", "") # Sometimes without comma?
    
    # Specific fixes
    if loc == "DEM REP OF THE CONGO":
        return "Democratic Republic of the Congo"
    
    return loc

def geocode_locations():
    script_dir = Path(__file__).parent
    data_path = script_dir / "cleaned/unified_removals.parquet"
    cache_path = script_dir / "cleaned/location_cache.json"
    mapping_path = script_dir / "cleaned/location_mappings.parquet"
    output_path = script_dir / "cleaned/unified_removals_with_geo.parquet"

    print(f"Loading data from {data_path}...")
    df = pl.read_parquet(data_path)

    # Columns to geocode
    target_cols = ["Port of Departure", "Departure Country", "Apprehension State"]
    
    print("Extracting unique locations...")
    unique_locs = get_unique_locations(df, target_cols)
    print(f"Found {len(unique_locs)} unique locations to geocode.")

    # Initialize Geolocator
    geolocator = Nominatim(user_agent="inter_gravity_project", timeout=10)
    geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1.0)

    # Load cache
    location_cache = load_cache(cache_path)
    
    # Geocode
    updated = False
    for i, loc in enumerate(unique_locs):
        if loc not in location_cache or location_cache[loc] is None:
            # Try to geocode if not in cache OR if previously failed (None)
            # We retry None because we might have improved the cleaning logic
            
            cleaned_loc = clean_location_name(loc)
            print(f"Geocoding ({i+1}/{len(unique_locs)}): {loc} -> {cleaned_loc}")
            
            try:
                location = geocode(cleaned_loc)
                if location:
                    location_cache[loc] = {
                        "lat": location.latitude,
                        "lon": location.longitude,
                        "address": location.address
                    }
                else:
                    print(f"  -> Not found: {loc}")
                    location_cache[loc] = None # Mark as not found to avoid retrying
                
                updated = True
                # Save periodically
                if i % 10 == 0:
                    save_cache(location_cache, cache_path)
            except Exception as e:
                print(f"  -> Error geocoding {loc}: {e}")
                time.sleep(2) # Wait a bit longer on error
        else:
            # print(f"Skipping cached: {loc}")
            pass

    if updated:
        save_cache(location_cache, cache_path)
        print("Cache updated.")

    # Create Mapping DataFrame
    print("Creating mapping DataFrame...")
    mapping_data = []
    for loc, data in location_cache.items():
        if data:
            mapping_data.append({
                "location_name": loc,
                "lat": data["lat"],
                "lon": data["lon"]
            })
    
    if not mapping_data:
        print("No geocoded data found.")
        return

    df_mapping = pl.DataFrame(mapping_data)
    df_mapping.write_parquet(mapping_path)
    print(f"Saved mappings to {mapping_path}")

    # Join back to main dataset
    print("Merging coordinates back to main dataset...")
    
    # We need to join for each column. 
    # Since they are different columns, we'll do it sequentially or stack?
    # Easier to join on each column and rename
    
    df_final = df
    
    for col in target_cols:
        # Prepare mapping for this column
        # Rename columns to avoid collision: lat -> {col}_lat
        suffix = col.lower().replace(" ", "_")
        
        mapping_renamed = df_mapping.rename({
            "location_name": col,
            "lat": f"{suffix}_lat",
            "lon": f"{suffix}_lon"
        })
        
        df_final = df_final.join(mapping_renamed, on=col, how="left")

    print(f"Saving final dataset with coordinates to {output_path}...")
    df_final.write_parquet(output_path)
    print("Done.")

if __name__ == "__main__":
    geocode_locations()
