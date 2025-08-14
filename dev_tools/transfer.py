#!/usr/bin/env python3
import argparse
import csv
import shutil
from pathlib import Path

def read_chinese_chars(csv_path):
    chars = []
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        # Skip header if it looks like one
        rows = list(reader)
        if rows and "chinese" in rows[0][0].lower():
            rows = rows[1:]
        for row in rows:
            if row and row[0].strip():
                chars.append(row[0].strip())
    return chars

def main():
    parser = argparse.ArgumentParser(description="Transfer WAV files with stripped names.")
    parser.add_argument("csv", help="Path to HSK CSV file")
    parser.add_argument("indir", help="Directory containing WAV files")
    parser.add_argument("outdir", help="Directory to copy renamed WAV files into")
    args = parser.parse_args()

    indir = Path(args.indir)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    chars = read_chinese_chars(Path(args.csv))

    for char in chars:
        matches = list(indir.glob(f"{char}*.wav"))
        if matches:
            src = matches[0]
            dst = outdir / f"{char}.wav"
            shutil.copy(src, dst)
            print(f"Copied: {src.name} -> {dst.name}")
        else:
            print(f"Missing: {char}")

## python transfer.py data/hsk0.csv wav_input wav_clean
if __name__ == "__main__":
    main()