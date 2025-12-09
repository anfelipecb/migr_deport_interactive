#!/usr/bin/env python3
"""
Create detention journey data for visualization.

This script:
1. Loads detention records from the ICE release data
2. Joins with facilities.csv to get geographic coordinates
3. Filters for individuals with 2+ detention records (transfers)
4. Creates chronologically ordered paths for each individual
5. Identifies the top 2 individuals with the most facility transfers
6. Generates JSON files for the visualization
"""

import polars as pl
import json
from pathlib import Path
from datetime import datetime


def create_detention_journey_data():
    """
    Create detention journey data for visualization.
    
    This function:
    1. Loads detention records from the ICE release data
    2. Joins with facilities.csv to get geographic coordinates
    3. Filters for individuals with 2+ detention records (transfers)
    4. Creates chronologically ordered paths for each individual
    5. Identifies the top 2 individuals with the most facility transfers
    6. Generates JSON files for the visualization
    """
    print("=" * 80)
    print("DETENTION JOURNEY DATA CREATION")
    print("=" * 80)
    
    # Paths (defined inside function)
    BASE_DIR = Path(__file__).parent.parent
    RAW_DIR = BASE_DIR / "raw"
    CLEANED_DIR = BASE_DIR / "cleaned"
    WWW_DATA_DIR = BASE_DIR.parent / "www" / "data"
    
    DETENTIONS_PATH = RAW_DIR / "ice_release_11aug2025_with_removals" / "2025-ICLI-00019_2024-ICFO-39357_ICE Detentions_LESA-STU_FINAL Redacted_raw.xlsx"
    FACILITIES_PATH = RAW_DIR / "facilities.csv"
    
    OUTPUT_FLOWS = WWW_DATA_DIR / "detention_flows.json"
    OUTPUT_HIGHLIGHTS = WWW_DATA_DIR / "detention_highlights.json"
    OUTPUT_STATISTICS = WWW_DATA_DIR / "detention_statistics.json"

    # 1. Load detentions data
    print(f"\n1. Loading detentions data from {DETENTIONS_PATH.name}...")
    df_detentions = pl.read_excel(
    DETENTIONS_PATH,
    engine="calamine",
    read_options={"header_row": 6}
    )
    print(f"   Loaded {df_detentions.shape[0]:,} detention records")
    print(f"   Columns: {len(df_detentions.columns)}")

    # 2. Load facilities data
    print(f"\n2. Loading facilities data from {FACILITIES_PATH.name}...")
    df_facilities = pl.read_csv(FACILITIES_PATH)
    print(f"   Loaded {df_facilities.shape[0]:,} facilities")

    # 3. Select and prepare detention columns
    print("\n3. Preparing detention data...")
    df_detentions = df_detentions.select([
    "Unique Identifier",
    "Detention Facility Code",
    "Stay Book In Date Time",
    "Stay Book Out Date Time",
    "Gender",
    "Birth Year",
    "Citizenship Country",
    "Ethnicity",
    ]).filter(
    pl.col("Unique Identifier").is_not_null() &
    pl.col("Detention Facility Code").is_not_null()
    )

    # Parse dates (they may already be datetime type from Excel)
    try:
        df_detentions = df_detentions.with_columns([
            pl.col("Stay Book In Date Time").cast(pl.Datetime).alias("book_in_date"),
            pl.col("Stay Book Out Date Time").cast(pl.Datetime).alias("book_out_date"),
        ])
    except Exception:
        # If already datetime, just rename
        df_detentions = df_detentions.with_columns([
            pl.col("Stay Book In Date Time").alias("book_in_date"),
            pl.col("Stay Book Out Date Time").alias("book_out_date"),
        ])

    # Filter out records with missing book in dates
    df_detentions = df_detentions.filter(pl.col("book_in_date").is_not_null())
    print(f"   After filtering: {df_detentions.shape[0]:,} records with valid data")

    # 4. Join with facilities
    print("\n4. Joining detentions with facilities...")
    df_joined = df_detentions.join(
        df_facilities,
        left_on="Detention Facility Code",
        right_on="detention_facility_code",
        how="left"
    )

    # Check for missing facility matches
    missing_facilities = df_joined.filter(pl.col("latitude").is_null())
    print(f"   Warning: {missing_facilities.shape[0]:,} records missing facility coordinates")
    if missing_facilities.shape[0] > 0:
        missing_codes = missing_facilities.select("Detention Facility Code").unique()
        print(f"   Missing facility codes (first 10): {missing_codes.head(10).to_series().to_list()}")

    # Filter to only records with valid coordinates
    df_joined = df_joined.filter(
    pl.col("latitude").is_not_null() &
    pl.col("longitude").is_not_null()
    )
    print(f"   After filtering: {df_joined.shape[0]:,} records with coordinates")

    # 5. Count detentions per individual
    print("\n5. Analyzing transfer patterns...")
    transfer_counts = df_joined.group_by("Unique Identifier").agg([
    pl.col("Detention Facility Code").n_unique().alias("unique_facilities"),
    pl.count().alias("detention_count")
    ]).sort("unique_facilities", descending=True)

    print(f"   Total unique individuals: {transfer_counts.shape[0]:,}")
    print(f"   Individuals with 2+ detentions: {transfer_counts.filter(pl.col('detention_count') >= 2).shape[0]:,}")
    print(f"   Individuals with 2+ facilities: {transfer_counts.filter(pl.col('unique_facilities') >= 2).shape[0]:,}")

    # 6. Filter for individuals with 2+ detentions (actual transfers)
    print("\n6. Filtering for individuals with 2+ detentions...")
    individuals_with_transfers = transfer_counts.filter(
    pl.col("detention_count") >= 2
    ).select("Unique Identifier")

    df_transfers = df_joined.join(
    individuals_with_transfers,
    on="Unique Identifier",
    how="inner"
    )
    print(f"   Filtered to {df_transfers.shape[0]:,} detention records")
    print(f"   Representing {individuals_with_transfers.shape[0]:,} individuals")

    # 7. Sort chronologically for each individual
    print("\n7. Creating chronologically ordered paths...")
    df_transfers = df_transfers.sort(["Unique Identifier", "book_in_date"])

    # 8. Build paths for each individual
    print("\n8. Building journey paths...")
    paths_data = []

    # Group by individual
    grouped = df_transfers.group_by("Unique Identifier")

    for unique_id, group_df in grouped:
        # Extract the actual ID value
        id_value = unique_id[0] if isinstance(unique_id, tuple) else unique_id
        
        # Skip empty or null unique identifiers
        if not id_value or id_value == "" or str(id_value).strip() == "":
            continue
        
        # Sort by date (should already be sorted but ensure it)
        group_df = group_df.sort("book_in_date")
        
        path = []
        for row in group_df.iter_rows(named=True):
            path.append({
                "facility_code": row["Detention Facility Code"],
                "facility_name": row["detention_facility_name"],
                "lat": float(row["latitude"]),
                "lon": float(row["longitude"]),
                "city": row["city"],
                "state": row["state"],
                "date": row["book_in_date"].isoformat() if row["book_in_date"] else None,
            })
    
    # Store the path data
    paths_data.append({
        "unique_id": id_value,
        "path": path,
        "transfer_count": len(path),
        "unique_facilities": len(set(p["facility_code"] for p in path)),
        # Store demographic info for potential use
        "gender": group_df["Gender"][0] if group_df.shape[0] > 0 else None,
        "birth_year": int(group_df["Birth Year"][0]) if group_df.shape[0] > 0 and group_df["Birth Year"][0] is not None else None,
        "citizenship": group_df["Citizenship Country"][0] if group_df.shape[0] > 0 else None,
    })

    print(f"   Created {len(paths_data)} journey paths")

    # 9. Identify top individuals with most transfers
    print("\n9. Identifying individuals with most transfers...")
    paths_data_sorted = sorted(paths_data, key=lambda x: x["unique_facilities"], reverse=True)

    print(f"   Top 10 individuals by unique facilities:")
    for i, person in enumerate(paths_data_sorted[:10], 1):
        print(f"   {i}. ID: {person['unique_id'][:20]}... - {person['unique_facilities']} facilities, {person['transfer_count']} detentions")

    # Get top 2 for highlights
    top_2 = paths_data_sorted[:2]

    # 10. Prepare output data - Aggregate flows by facility pairs
    print("\n10. Aggregating flows by facility pairs...")

    # Aggregate all segments into origin-destination pairs with counts
    flow_aggregates = {}
    for person in paths_data:
        path = person["path"]
        for i in range(len(path) - 1):
            origin = path[i]["facility_code"]
            dest = path[i + 1]["facility_code"]
            
            if origin == dest:
                continue
                
            # Create a unique key for this facility pair
            pair_key = f"{origin}->{dest}"
            
            if pair_key not in flow_aggregates:
                flow_aggregates[pair_key] = {
                    "origin": {
                        "facility_code": path[i]["facility_code"],
                        "facility_name": path[i]["facility_name"],
                        "lat": path[i]["lat"],
                        "lon": path[i]["lon"],
                        "city": path[i]["city"],
                        "state": path[i]["state"],
                    },
                    "destination": {
                        "facility_code": path[i + 1]["facility_code"],
                        "facility_name": path[i + 1]["facility_name"],
                        "lat": path[i + 1]["lat"],
                        "lon": path[i + 1]["lon"],
                        "city": path[i + 1]["city"],
                        "state": path[i + 1]["state"],
                    },
                    "count": 0
                }
            
            flow_aggregates[pair_key]["count"] += 1

    print(f"   Aggregated to {len(flow_aggregates)} unique facility-pair flows")

    # Convert to list and sort by count
    aggregated_flows = list(flow_aggregates.values())
    aggregated_flows.sort(key=lambda x: x["count"], reverse=True)

    # Calculate scaled counts for visualization (similar to removals map)
    max_count = aggregated_flows[0]["count"] if aggregated_flows else 1
    min_count = aggregated_flows[-1]["count"] if aggregated_flows else 1

    print(f"   Flow volumes: {min_count} to {max_count} transfers per facility pair")
    print(f"   Top 5 busiest routes:")
    for i, flow in enumerate(aggregated_flows[:5], 1):
        print(f"   {i}. {flow['origin']['facility_name']} → {flow['destination']['facility_name']}: {flow['count']} transfers")

    # Scale particle counts (max 5 particles per flow, min 1)
    for flow in aggregated_flows:
        if max_count > min_count:
            normalized = (flow["count"] - min_count) / (max_count - min_count)
            flow["scaled_count"] = max(1, int(normalized * 4) + 1)  # 1 to 5 particles
        else:
            flow["scaled_count"] = 1

    flows_output = {
    "flows": aggregated_flows,
    "total_segments": sum(f["count"] for f in aggregated_flows),
    "unique_routes": len(aggregated_flows),
    }

    # Calculate total distance for highlighted individuals (before creating highlights output)
    # Import haversine function here since it's defined later
    from math import radians, cos, sin, asin, sqrt

    def haversine_distance_early(lon1, lat1, lon2, lat2):
        """Calculate the great circle distance in kilometers between two points"""
        lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
        dlon = lon2 - lon1
        dlat = lat2 - lat1
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a))
        km = 6371 * c
        return km

    # Calculate total distance for highlighted individuals
    for person in top_2:
        total_dist_km = 0
        path = person["path"]
        for i in range(len(path) - 1):
            dist = haversine_distance_early(path[i]["lon"], path[i]["lat"], path[i + 1]["lon"], path[i + 1]["lat"])
            total_dist_km += dist
        
        person["total_distance_km"] = total_dist_km
        person["total_distance_miles"] = total_dist_km * 0.621371

    # Highlights data with full demographic info
    highlights_output = {
    "highlights": [
        {
            "unique_id": person["unique_id"],
            "path": person["path"],
            "transfer_count": person["transfer_count"],
            "unique_facilities": person["unique_facilities"],
            "story_data": {
                "gender": person["gender"],
                "birth_year": person["birth_year"],
                "citizenship": person["citizenship"],
                "first_facility": person["path"][0]["facility_name"] if len(person["path"]) > 0 else None,
                "first_state": person["path"][0]["state"] if len(person["path"]) > 0 else None,
                "last_facility": person["path"][-1]["facility_name"] if len(person["path"]) > 0 else None,
                "last_state": person["path"][-1]["state"] if len(person["path"]) > 0 else None,
                "first_date": person["path"][0]["date"] if len(person["path"]) > 0 else None,
                "last_date": person["path"][-1]["date"] if len(person["path"]) > 0 else None,
                "total_distance_km": person.get("total_distance_km", 0),
                "total_distance_miles": person.get("total_distance_miles", 0),
            }
        }
        for person in top_2
    ],
    "max_transfers": paths_data_sorted[0]["unique_facilities"] if paths_data_sorted else 0,
    }

    # 11. Calculate distances and location statistics
    print("\n11. Calculating distances and location statistics...")

    from math import radians, cos, sin, asin, sqrt

    def haversine_distance(lon1, lat1, lon2, lat2):
        """Calculate the great circle distance in kilometers between two points"""
        lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
        dlon = lon2 - lon1
        dlat = lat2 - lat1
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a))
        km = 6371 * c
        return km

    # Calculate distances for all flows
    total_distance_km = 0
    for flow in aggregated_flows:
        origin = flow["origin"]
        dest = flow["destination"]
        distance_km = haversine_distance(origin["lon"], origin["lat"], dest["lon"], dest["lat"])
        flow["distance_km"] = distance_km
        flow["distance_miles"] = distance_km * 0.621371
        total_distance_km += distance_km * flow["count"]

    avg_distance_km = total_distance_km / flows_output["total_segments"] if flows_output["total_segments"] > 0 else 0
    avg_distance_miles = avg_distance_km * 0.621371

    print(f"   Average transfer distance: {avg_distance_km:.1f} km ({avg_distance_miles:.1f} miles)")

    # Identify Chicago-area facilities (within ~100km of Chicago: 41.8781, -87.6298)
    chicago_lat, chicago_lon = 41.8781, -87.6298
    chicago_radius_km = 100

    chicago_facilities = []
    for facility in df_facilities.iter_rows(named=True):
        if facility["latitude"] and facility["longitude"]:
            dist_to_chicago = haversine_distance(facility["longitude"], facility["latitude"], chicago_lon, chicago_lat)
            if dist_to_chicago <= chicago_radius_km:
                chicago_facilities.append({
                    "code": facility["detention_facility_code"],
                    "name": facility["detention_facility_name"],
                    "lat": facility["latitude"],
                    "lon": facility["longitude"],
                    "city": facility["city"],
                    "state": facility["state"],
                    "distance_to_chicago": dist_to_chicago
                })

    print(f"   Found {len(chicago_facilities)} facilities near Chicago")

    # Calculate statistics for Chicago area
    chicago_outflows = 0
    chicago_inflows = 0
    chicago_destinations = {}
    chicago_origins = {}

    for person in paths_data:
        path = person["path"]
        for i in range(len(path) - 1):
            origin_code = path[i]["facility_code"]
            dest_code = path[i + 1]["facility_code"]
            
            # Check if origin is in Chicago area (outflows)
            if any(f["code"] == origin_code for f in chicago_facilities):
                chicago_outflows += 1
                dest_name = path[i + 1]["facility_name"]
                dest_key = f"{dest_code}|{dest_name}"
                
                if dest_key not in chicago_destinations:
                    chicago_destinations[dest_key] = {
                        "code": dest_code,
                        "name": dest_name,
                        "lat": path[i + 1]["lat"],
                        "lon": path[i + 1]["lon"],
                        "count": 0
                    }
                chicago_destinations[dest_key]["count"] += 1
            
            # Check if destination is in Chicago area (inflows)
            if any(f["code"] == dest_code for f in chicago_facilities):
                chicago_inflows += 1
                origin_name = path[i]["facility_name"]
                origin_key = f"{origin_code}|{origin_name}"
                
                if origin_key not in chicago_origins:
                    chicago_origins[origin_key] = {
                        "code": origin_code,
                        "name": origin_name,
                        "lat": path[i]["lat"],
                        "lon": path[i]["lon"],
                        "count": 0
                    }
                chicago_origins[origin_key]["count"] += 1

    # Get top 5 Chicago destinations (outflows)
    chicago_top_dests = sorted(chicago_destinations.values(), key=lambda x: x["count"], reverse=True)[:5]
    for dest in chicago_top_dests:
        # Calculate distance from Chicago
        if chicago_facilities:
            avg_chicago_lat = sum(f["lat"] for f in chicago_facilities) / len(chicago_facilities)
            avg_chicago_lon = sum(f["lon"] for f in chicago_facilities) / len(chicago_facilities)
            dest["distance_km"] = haversine_distance(avg_chicago_lon, avg_chicago_lat, dest["lon"], dest["lat"])
            dest["distance_miles"] = dest["distance_km"] * 0.621371

    # Get top 5 Chicago origins (inflows)
    chicago_top_origins = sorted(chicago_origins.values(), key=lambda x: x["count"], reverse=True)[:5]
    for origin in chicago_top_origins:
        # Calculate distance from Chicago
        if chicago_facilities:
            avg_chicago_lat = sum(f["lat"] for f in chicago_facilities) / len(chicago_facilities)
            avg_chicago_lon = sum(f["lon"] for f in chicago_facilities) / len(chicago_facilities)
            origin["distance_km"] = haversine_distance(avg_chicago_lon, avg_chicago_lat, origin["lon"], origin["lat"])
            origin["distance_miles"] = origin["distance_km"] * 0.621371

    print(f"   Chicago area: {chicago_outflows} outflows, {chicago_inflows} inflows")
    if chicago_top_dests:
        print(f"   Top Chicago destination: {chicago_top_dests[0]['name']} ({chicago_top_dests[0]['count']} transfers)")

    # Find top 2 busiest facilities (excluding Chicago area codes)
    chicago_codes = {f["code"] for f in chicago_facilities}
    facility_transfer_counts = {}

    for flow in aggregated_flows:
        origin_code = flow["origin"]["facility_code"]
        dest_code = flow["destination"]["facility_code"]
        
        # Track outflows from origin (if not Chicago)
        if origin_code not in chicago_codes:
            if origin_code not in facility_transfer_counts:
                facility_transfer_counts[origin_code] = {
                    "code": origin_code,
                    "name": flow["origin"]["facility_name"],
                    "lat": flow["origin"]["lat"],
                    "lon": flow["origin"]["lon"],
                    "city": flow["origin"]["city"],
                    "state": flow["origin"]["state"],
                    "outflows": 0,
                    "inflows": 0,
                    "destinations": {},
                    "origins": {}
                }
            
            facility_transfer_counts[origin_code]["outflows"] += flow["count"]
            
            dest_key = flow["destination"]["facility_code"]
            if dest_key not in facility_transfer_counts[origin_code]["destinations"]:
                facility_transfer_counts[origin_code]["destinations"][dest_key] = {
                    "code": flow["destination"]["facility_code"],
                    "name": flow["destination"]["facility_name"],
                    "lat": flow["destination"]["lat"],
                    "lon": flow["destination"]["lon"],
                    "count": 0
                }
            facility_transfer_counts[origin_code]["destinations"][dest_key]["count"] += flow["count"]
        
        # Track inflows to destination (if not Chicago)
        if dest_code not in chicago_codes:
            if dest_code not in facility_transfer_counts:
                facility_transfer_counts[dest_code] = {
                    "code": dest_code,
                    "name": flow["destination"]["facility_name"],
                    "lat": flow["destination"]["lat"],
                    "lon": flow["destination"]["lon"],
                    "city": flow["destination"]["city"],
                    "state": flow["destination"]["state"],
                    "outflows": 0,
                    "inflows": 0,
                    "destinations": {},
                    "origins": {}
                }
            
            facility_transfer_counts[dest_code]["inflows"] += flow["count"]
            
            origin_key = flow["origin"]["facility_code"]
            if origin_key not in facility_transfer_counts[dest_code]["origins"]:
                facility_transfer_counts[dest_code]["origins"][origin_key] = {
                    "code": flow["origin"]["facility_code"],
                    "name": flow["origin"]["facility_name"],
                    "lat": flow["origin"]["lat"],
                    "lon": flow["origin"]["lon"],
                    "count": 0
                }
            facility_transfer_counts[dest_code]["origins"][origin_key]["count"] += flow["count"]

    # Sort facilities by total transfer count (inflows + outflows)
    for facility in facility_transfer_counts.values():
        facility["total_transfers"] = facility["outflows"] + facility["inflows"]

    sorted_facilities = sorted(facility_transfer_counts.values(), key=lambda x: x["total_transfers"], reverse=True)
    top_2_facilities = sorted_facilities[:2]

    # Calculate top destinations and origins for each busiest facility
    for facility in top_2_facilities:
        # Top destinations (where people are transferred TO)
        top_dests = sorted(facility["destinations"].values(), key=lambda x: x["count"], reverse=True)[:5]
        for dest in top_dests:
            dest["distance_km"] = haversine_distance(facility["lon"], facility["lat"], dest["lon"], dest["lat"])
            dest["distance_miles"] = dest["distance_km"] * 0.621371
        facility["top_destinations"] = top_dests
        
        # Top origins (where people are transferred FROM)
        top_origs = sorted(facility["origins"].values(), key=lambda x: x["count"], reverse=True)[:5]
        for origin in top_origs:
            origin["distance_km"] = haversine_distance(facility["lon"], facility["lat"], origin["lon"], origin["lat"])
            origin["distance_miles"] = origin["distance_km"] * 0.621371
        facility["top_origins"] = top_origs
        
        del facility["destinations"]  # Remove full destinations dict
        del facility["origins"]  # Remove full origins dict

    print(f"   Busiest facility #1: {top_2_facilities[0]['name']} ({top_2_facilities[0]['outflows']} out, {top_2_facilities[0]['inflows']} in)")
    print(f"   Busiest facility #2: {top_2_facilities[1]['name']} ({top_2_facilities[1]['outflows']} out, {top_2_facilities[1]['inflows']} in)")

    print(f"   Person 1 traveled: {top_2[0]['total_distance_km']:.0f} km ({top_2[0]['total_distance_miles']:.0f} miles)")
    print(f"   Person 2 traveled: {top_2[1]['total_distance_km']:.0f} km ({top_2[1]['total_distance_miles']:.0f} miles)")

    # Create statistics output
    statistics_output = {
    "overall_stats": {
        "avg_transfer_distance_km": round(avg_distance_km, 1),
        "avg_transfer_distance_miles": round(avg_distance_miles, 1),
        "total_transfers": flows_output["total_segments"],
        "unique_routes": len(aggregated_flows)
    },
    "featured_locations": [
        {
            "name": "Chicago Area",
            "type": "region",
            "facilities": chicago_facilities[:3] if chicago_facilities else [],
            "total_transfers": chicago_outflows + chicago_inflows,
            "outflows": chicago_outflows,
            "inflows": chicago_inflows,
            "top_destinations": chicago_top_dests,
            "top_origins": chicago_top_origins,
            "camera": {
                "center": [chicago_lon, chicago_lat],
                "zoom": 9,
                "pitch": 0,
                "bearing": 0
            }
        },
        {
            "name": top_2_facilities[0]["name"],
            "type": "facility",
            "code": top_2_facilities[0]["code"],
            "lat": top_2_facilities[0]["lat"],
            "lon": top_2_facilities[0]["lon"],
            "city": top_2_facilities[0]["city"],
            "state": top_2_facilities[0]["state"],
            "total_transfers": top_2_facilities[0]["total_transfers"],
            "outflows": top_2_facilities[0]["outflows"],
            "inflows": top_2_facilities[0]["inflows"],
            "top_destinations": top_2_facilities[0]["top_destinations"],
            "top_origins": top_2_facilities[0]["top_origins"],
            "camera": {
                "center": [top_2_facilities[0]["lon"], top_2_facilities[0]["lat"]],
                "zoom": 6,
                "pitch": 0,
                "bearing": 0
            }
        },
        {
            "name": top_2_facilities[1]["name"],
            "type": "facility",
            "code": top_2_facilities[1]["code"],
            "lat": top_2_facilities[1]["lat"],
            "lon": top_2_facilities[1]["lon"],
            "city": top_2_facilities[1]["city"],
            "state": top_2_facilities[1]["state"],
            "total_transfers": top_2_facilities[1]["total_transfers"],
            "outflows": top_2_facilities[1]["outflows"],
            "inflows": top_2_facilities[1]["inflows"],
            "top_destinations": top_2_facilities[1]["top_destinations"],
            "top_origins": top_2_facilities[1]["top_origins"],
            "camera": {
                "center": [top_2_facilities[1]["lon"], top_2_facilities[1]["lat"]],
                "zoom": 6,
                "pitch": 0,
                "bearing": 0
            }
        }
    ]
    }

    OUTPUT_STATISTICS = WWW_DATA_DIR / "detention_statistics.json"

    # 12. Write output files
    print("\n12. Writing output files...")
    WWW_DATA_DIR.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_FLOWS, 'w') as f:
        json.dump(flows_output, f, indent=2)
    print(f"   ✓ Wrote {OUTPUT_FLOWS}")

    with open(OUTPUT_HIGHLIGHTS, 'w') as f:
        json.dump(highlights_output, f, indent=2)
    print(f"   ✓ Wrote {OUTPUT_HIGHLIGHTS}")

    with open(OUTPUT_STATISTICS, 'w') as f:
        json.dump(statistics_output, f, indent=2)
    print(f"   ✓ Wrote {OUTPUT_STATISTICS}")

    print("\n" + "=" * 80)
    print("COMPLETE!")
    print("=" * 80)
    print(f"\nSummary:")
    print(f"  - Total detention records processed: {df_detentions.shape[0]:,}")
    print(f"  - Individuals with 2+ detentions: {len(paths_data):,}")
    print(f"  - Aggregated facility-pair routes: {len(aggregated_flows):,}")
    print(f"  - Total transfers across all routes: {flows_output['total_segments']:,}")
    print(f"  - Top individual has {paths_data_sorted[0]['unique_facilities']} unique facilities")
    print(f"  - Data files written to: {WWW_DATA_DIR}")


if __name__ == "__main__":
    create_detention_journey_data()
