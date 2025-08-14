#!/usr/bin/env python3
import argparse, csv, os, sys, time, re, json
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

# ---- Config defaults ----
DEFAULT_MODEL = "tts-1"          # or "tts-1-hd"
DEFAULT_VOICE = "alloy"          # choose any supported OpenAI TTS voice
OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech"

def detect_delimiter(sample: str) -> str:
    # Simple heuristic: prefer comma, else tab
    return "," if sample.count(",") >= sample.count("\t") else "\t"

def safe_filename(name: str) -> str:
    # Keep Unicode (Chinese) but remove slashes/control chars
    name = name.strip()
    name = re.sub(r"[\\/:*?\"<>|]", "_", name)  # Windows reserved
    name = re.sub(r"\s+", " ", name).strip()
    return name or "untitled"

def read_rows(csv_path: Path):
    text = csv_path.read_text(encoding="utf-8-sig")
    delim = detect_delimiter(text.splitlines()[0] if text else ",")
    reader = csv.reader(text.splitlines(), delimiter=delim)
    rows = list(reader)
    # Skip header if it looks like one
    if rows and len(rows[0]) >= 3:
        header = [c.lower() for c in rows[0][:3]]
        if "chinese" in header[0] and "pinyin" in header[1] and "english" in header[2]:
            rows = rows[1:]
    # Ensure at least 3 columns
    cleaned = [r for r in rows if len(r) >= 3 and (r[0].strip() or r[1].strip())]
    return cleaned

def build_tts_input(hanzi: str, pinyin: str, before: str, after: str) -> str:
    core = hanzi if hanzi else pinyin
    if before or after:
        # Optional natural context (keeps display unchanged in your app)
        return f"{before}{('“' + core + '”') if core else ''}{after}"
    return core

def synthesize_wav(api_key: str, text: str, model: str, voice: str) -> bytes:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "voice": voice,
        "input": text,
        "format": "wav",   # WAV output
    }
    r = requests.post(OPENAI_TTS_URL, headers=headers, data=json.dumps(payload), timeout=90)
    if r.status_code != 200:
        raise RuntimeError(f"TTS failed ({r.status_code}): {r.text[:300]}...")
    return r.content

def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description="Generate WAVs from HSK CSV via OpenAI TTS.")
    parser.add_argument("csv", help="Path to CSV, e.g. data/hsk0.csv (or just 'hsk0' to auto-prepend .csv)")
    parser.add_argument("--out", default="tts_out_wav", help="Output directory (default: tts_out_wav)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="OpenAI TTS model (tts-1 or tts-1-hd)")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="OpenAI TTS voice (e.g., alloy, verse, onyx...)")
    parser.add_argument("--before", default="", help='Optional text before the word (e.g., "这个词是")')
    parser.add_argument("--after",  default="", help='Optional text after the word (e.g., "。")')
    parser.add_argument("--limit", type=int, default=0, help="Only process first N rows (0 = all)")
    parser.add_argument("--skip-existing", action="store_true", help="Skip files that already exist")
    parser.add_argument("--sleep", type=float, default=0.3, help="Sleep seconds between calls (default 0.3)")
    args = parser.parse_args()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        sys.exit("ERROR: OPENAI_API_KEY not set (env or .env).")

    csv_path = Path(args.csv)
    if csv_path.suffix.lower() != ".csv":
        # Allow shorthand "hsk0" -> "data/hsk0.csv" or "./hsk0.csv" if present
        candidate1 = Path("data") / f"{csv_path.name}.csv"
        candidate2 = Path(f"{csv_path.name}.csv")
        if candidate1.exists():
            csv_path = candidate1
        elif candidate2.exists():
            csv_path = candidate2
        else:
            csv_path = Path(f"{csv_path}.csv")

    if not csv_path.exists():
        sys.exit(f"ERROR: CSV file not found: {csv_path}")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = read_rows(csv_path)
    if not rows:
        sys.exit("No valid rows found (need at least 3 columns: Chinese, Pinyin, English).")

    total = len(rows) if args.limit <= 0 else min(args.limit, len(rows))
    print(f"[TTS] Input: {csv_path}   Rows: {len(rows)}   Will process: {total}")
    print(f"[TTS] Model: {args.model}   Voice: {args.voice}   Out: {out_dir.resolve()}")

    processed = 0
    for i, r in enumerate(rows):
        if processed >= total:
            break
        hanzi, pinyin, english = (r[0].strip(), r[1].strip(), r[2].strip())
        if not (hanzi or pinyin):
            continue

        # Build filename (Chinese preferred)
        base = safe_filename(hanzi if hanzi else pinyin)
        fname = f"{base}__{args.voice}__{args.model}.wav"
        out_path = out_dir / fname

        if args.skip_existing and out_path.exists():
            print(f"  [{i+1:>4}] SKIP (exists): {out_path.name}")
            processed += 1
            continue

        text = build_tts_input(hanzi, pinyin, args.before, args.after) or english
        if not text:
            print(f"  [{i+1:>4}] SKIP (empty text)")
            continue

        try:
            audio = synthesize_wav(api_key, text, args.model, args.voice)
            out_path.write_bytes(audio)
            print(f"  [{i+1:>4}] OK  -> {out_path.name}")
            processed += 1
            if args.sleep > 0:
                time.sleep(args.sleep)
        except Exception as e:
            print(f"  [{i+1:>4}] FAIL: {e}")

    print(f"[TTS] Done. Generated {processed} WAV file(s).")

if __name__ == "__main__":
    main()