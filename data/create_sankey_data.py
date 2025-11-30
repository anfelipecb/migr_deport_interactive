import polars as pl
import json
from pathlib import Path

def create_sankey_data():
    """
    Creates simplified Sankey diagram data showing the flow through the deportation pipeline:
    Arrest → Detention → Removal
    
    Aggregates totals across all records (no time grouping).
    Uses simple source-target-value format for d3-sankey.
    """
    script_dir = Path(__file__).parent
    data_path = script_dir / "cleaned/unified_removals_with_geo.parquet"
    output_dir = script_dir.parent / "www/data"
    output_path = output_dir / "sankey_data.json"
    
    print(f"Loading data from {data_path}...")
    df = pl.read_parquet(data_path)
    
    print(f"Total records: {len(df)}")
    
    # Count flows through the pipeline
    # All records are removals (base dataset), so we're tracking:
    # 1. Arrest → Detention → Removal (has both flags)
    # 2. Arrest → Removal (has arrest, no detention)
    # 3. Detention → Removal (has detention, no arrest)
    
    total = len(df)
    
    # Count each path
    has_both = df.filter(
        (pl.col("has_arrest_record") == True) & 
        (pl.col("has_detention_record") == True)
    )
    has_arrest_only = df.filter(
        (pl.col("has_arrest_record") == True) & 
        (pl.col("has_detention_record") == False)
    )
    has_detention_only = df.filter(
        (pl.col("has_arrest_record") == False) & 
        (pl.col("has_detention_record") == True)
    )
    
    # Create links with string names (d3-sankey will auto-infer nodes)
    links = []
    
    # Arrest → Detention (people who went through both)
    arrest_to_detention = len(has_both)
    if arrest_to_detention > 0:
        links.append({
            "source": "Arrest",
            "target": "Detention",
            "value": arrest_to_detention
        })
    
    # Arrest → Removal (people with arrest but no detention record)
    arrest_to_removal = len(has_arrest_only)
    if arrest_to_removal > 0:
        links.append({
            "source": "Arrest",
            "target": "Removal",
            "value": arrest_to_removal
        })
    
    # Detention → Removal (people with detention but no arrest record)
    detention_to_removal = len(has_detention_only)
    if detention_to_removal > 0:
        links.append({
            "source": "Detention",
            "target": "Removal",
            "value": detention_to_removal
        })
    
    # Simple JSON structure - d3-sankey will infer nodes from links
    output_data = {
        "links": links
    }
    
    # Save to JSON
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"\nSaving Sankey data to {output_path}...")
    print(f"Links: {len(links)}")
    for link in links:
        print(f"  {link['source']} → {link['target']}: {link['value']:,}")
    
    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"Done. Total removals: {total:,}")
    return output_data

if __name__ == "__main__":
    create_sankey_data()

