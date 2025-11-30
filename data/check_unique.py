import polars as pl
from pathlib import Path

def check_unique_counts():
    script_dir = Path(__file__).parent
    data_path = script_dir / "cleaned/unified_removals.parquet"
    
    print(f"Loading data from {data_path}...")
    df = pl.read_parquet(data_path)
    
    cols_to_check = ["Port of Departure", "Departure Country", "Apprehension State"]
    
    for col in cols_to_check:
        if col in df.columns:
            n_unique = df[col].n_unique()
            print(f"Column '{col}' has {n_unique} unique values.")
            print(f"Top 5 values for '{col}':")
            print(df[col].value_counts().sort("count", descending=True).head(5))
        else:
            print(f"Column '{col}' not found in dataset.")

if __name__ == "__main__":
    check_unique_counts()
