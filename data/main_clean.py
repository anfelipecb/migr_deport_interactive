#!/usr/bin/env python3
"""
Main data processing orchestrator.

This script runs all data processing steps in the correct order:
1. Clean and merge ICE data (Arrests, Removals, Detentions)
2. Create migration data from MPI Excel file
3. Geocode locations in the unified removals dataset
4. Aggregate flows for the removal flows map
5. Create Sankey diagram data
6. Create timeline data
7. Create detention journey data

Run with: uv run data/main_clean.py
"""

import sys
from pathlib import Path

# Add processing directory to path
processing_dir = Path(__file__).parent / "processing"
sys.path.insert(0, str(processing_dir))

from clean_ice import clean_and_merge
from clean_migration import create_migration_data
from geocode import geocode_locations
from aggregate_flows import aggregate_data
from create_sankey import create_sankey_data
from create_timeline import create_timeline_data
from create_detention_journey import create_detention_journey_data


def main():
    """Run all data processing steps in order."""
    print("=" * 80)
    print("DATA PROCESSING PIPELINE")
    print("=" * 80)
    print()
    
    steps = [
        ("Cleaning and merging ICE data", clean_and_merge),
        ("Creating migration data", create_migration_data),
        ("Geocoding locations", geocode_locations),
        ("Aggregating removal flows", aggregate_data),
        ("Creating Sankey diagram data", create_sankey_data),
        ("Creating timeline data", create_timeline_data),
        ("Creating detention journey data", create_detention_journey_data),
    ]
    
    for i, (step_name, step_func) in enumerate(steps, 1):
        print(f"\n[{i}/{len(steps)}] {step_name}...")
        print("-" * 80)
        try:
            step_func()
            print(f"✓ {step_name} completed successfully")
        except Exception as e:
            print(f"✗ Error in {step_name}: {e}")
            raise
    
    print("\n" + "=" * 80)
    print("ALL DATA PROCESSING STEPS COMPLETED SUCCESSFULLY!")
    print("=" * 80)
    print("\nOutput files are in www/data/")
    print("You can now serve the visualization from the www/ directory.")


if __name__ == "__main__":
    main()

