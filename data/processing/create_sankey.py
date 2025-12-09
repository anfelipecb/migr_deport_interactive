"""
Create Sankey diagram data showing flows through the deportation pipeline.
Creates sankey_data.json for the Sankey visualization.
"""

import polars as pl
import json
from pathlib import Path


def load_excel(path: Path) -> pl.DataFrame:
    """Read a dataset with the common header row."""
    return pl.read_excel(path, engine="calamine", read_options={"header_row": 6})


def dedupe_first(df: pl.DataFrame, uid_col: str, date_col: str, alias: str) -> pl.DataFrame:
    """Return earliest record per unique identifier for the given date column."""
    return (
        df.select([uid_col, date_col])
        .filter(pl.col(uid_col).is_not_null() & pl.col(date_col).is_not_null())
        .with_columns(pl.col(date_col).cast(pl.Datetime).alias("dt"))
        .sort([uid_col, "dt"])
        .unique(subset=[uid_col], keep="first")
        .rename({uid_col: "Unique Identifier", "dt": alias})
    )


def create_sankey_data():
    """
    Creates person-level Sankey data showing flows:
      Arrest → Detention / No Detention
      Detention → Removal / No Removal
    """
    script_dir = Path(__file__).parent.parent
    base_path = script_dir / "raw/ice_release_11aug2025_with_removals"
    arrests_path = base_path / "2025-ICLI-00019_2024-ICFO-39357_ERO Admin Arrests_LESA-STU_FINAL Redacted_raw.xlsx"
    detentions_path = base_path / "2025-ICLI-00019_2024-ICFO-39357_ICE Detentions_LESA-STU_FINAL Redacted_raw.xlsx"
    removals_path = base_path / "2025-ICLI-00019_2024-ICFO-39357_ICE Removals_LESA-STU_FINAL Redacted_raw.xlsx"

    output_dir = script_dir.parent / "www/data"
    output_path = output_dir / "sankey_data.json"

    print("Loading arrests, detentions, removals...")
    df_arrests = load_excel(arrests_path)
    df_detentions = load_excel(detentions_path)
    df_removals = load_excel(removals_path)

    arrest_people = dedupe_first(df_arrests, "Unique Identifier", "Apprehension Date", "arrest_date")
    detention_people = dedupe_first(df_detentions, "Unique Identifier", "Stay Book In Date Time", "detention_date")
    removal_people = (
        df_removals.select(["Unique Identifier", "Departed Date"])
        .filter(pl.col("Unique Identifier").is_not_null())
        .with_columns(pl.col("Departed Date").cast(pl.Date).alias("removal_date"))
        .filter(pl.col("removal_date").is_not_null())
        .sort(["Unique Identifier", "removal_date"])
        .unique(subset=["Unique Identifier"], keep="first")
    )

    all_ids = pl.concat(
        [
            arrest_people.select("Unique Identifier"),
            detention_people.select("Unique Identifier"),
            removal_people.select("Unique Identifier"),
        ]
    ).unique()

    persons = (
        all_ids
        .join(arrest_people, on="Unique Identifier", how="left")
        .join(detention_people, on="Unique Identifier", how="left")
        .join(removal_people, on="Unique Identifier", how="left")
        .with_columns(
            [
                pl.col("arrest_date").is_not_null().alias("has_arrest"),
                pl.col("detention_date").is_not_null().alias("has_detention"),
                pl.col("removal_date").is_not_null().alias("has_removal"),
            ]
        )
    )

    total_people = len(persons)
    print(f"Total unique people across datasets: {total_people:,}")

    arrested = persons.filter(pl.col("has_arrest"))
    detention_stage = persons.filter(pl.col("has_detention"))

    arrest_to_detention = arrested.filter(pl.col("has_detention")).height
    arrest_to_no_detention = arrested.filter(~pl.col("has_detention")).height
    no_ice_arrest_to_detention = persons.filter(~pl.col("has_arrest") & pl.col("has_detention")).height
    detention_to_removal = detention_stage.filter(pl.col("has_removal")).height
    detention_to_no_removal = detention_stage.filter(~pl.col("has_removal")).height

    links = []
    if arrest_to_detention:
        links.append({"source": "Arrest", "target": "Detention", "value": arrest_to_detention})
    if arrest_to_no_detention:
        links.append({"source": "Arrest", "target": "No Detention", "value": arrest_to_no_detention})
    if no_ice_arrest_to_detention:
        links.append({"source": "No ICE Arrest", "target": "Detention", "value": no_ice_arrest_to_detention})
    if detention_to_removal:
        links.append({"source": "Detention", "target": "Removal", "value": detention_to_removal})
    if detention_to_no_removal:
        links.append({"source": "Detention", "target": "No Removal", "value": detention_to_no_removal})

    output_data = {"links": links}

    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"\nSaving Sankey data to {output_path}...")
    for link in links:
        print(f"  {link['source']} → {link['target']}: {link['value']:,}")

    with open(output_path, "w") as f:
        json.dump(output_data, f, indent=2)

    print("Done.")
    return output_data


if __name__ == "__main__":
    create_sankey_data()

