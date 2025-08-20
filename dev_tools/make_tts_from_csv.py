#!/usr/bin/env python3
import argparse, csv, os, sys, time, re, json
from pathlib import Path
from dotenv import load_dotenv
import requests

# ---- Config defaults ----
DEFAULT_MODEL = "gpt-4o-mini-tts"   # or "tts-1"
DEFAULT_VOICE = "alloy"
OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech"

# ---- Default teaching/flashcard prompt ----
INSTRUCTIONS_DEFAULT = (
    "Context: This audio will be used in a flashcard language-learning app. "
    "The user hears only this snippet in isolation, so pronunciation should be precise, clear, and slightly over-articulated. "
    "Avoid filler words or conversational extras. Deliver the phrase as if teaching correct pronunciation. "
    "Use standard American English pronunciation throughout.\n\n"
    "Voice Affect: Calm, composed, and reassuring; project quiet authority and confidence.\n\n"
    "Tone: Sincere, empathetic, and gently authoritative—express genuine care while demonstrating competence.\n\n"
    "Pacing: Steady and moderate; unhurried enough for clarity, yet efficient enough to remain engaging.\n\n"
    "Emotion: Genuine warmth and encouragement; the delivery should feel supportive, as if helping someone learn with patience.\n\n"
    "Pronunciation: Clear and precise, slightly over-corrected to emphasize accurate articulation. "
    "Stress key syllables and word boundaries to reinforce correct learning. "
    "Default to American English pronunciation when multiple variants exist.\n\n"
    "Pauses: Brief pauses after the snippet if necessary, highlighting that the unit is complete and self-contained."
)

INSTRUCTIONS_DEFAULT = (
    "Context: This audio will be used in a flashcard language-learning app. "
    "The user hears only this snippet in isolation, so pronunciation should be precise, clear, and slightly over-articulated. "
    "Avoid filler words or conversational extras. Deliver the phrase as if teaching correct pronunciation. "
    "Use standard Mandarin Chinese pronunciation.\n\n"
    "Voice Affect: Calm, composed, and reassuring; project quiet authority and confidence.\n\n"
    "Tone: Sincere, empathetic, and gently authoritative—express genuine care while demonstrating competence.\n\n"
    "Pacing: Steady and moderate; unhurried enough for clarity, yet efficient enough to remain engaging.\n\n"
    "Emotion: Genuine warmth and encouragement; the delivery should feel supportive, as if helping someone learn with patience.\n\n"
    "Pronunciation: Clear and precise, slightly over-corrected to emphasize accurate articulation. "
    "Stress key syllables and word boundaries to reinforce correct learning. "
    "If Pinyin is provided alongside characters, use it only as a guide but do not read it aloud.\n\n"
    "Pauses: Brief pauses after the snippet if necessary, highlighting that the unit is complete and self-contained."
)

INSTRUCTIONS_LAOBEIJING = (
    "Context: This audio will be used in a flashcard language-learning app. "
    "The user hears only this snippet in isolation. "
    "Use the 老北京话 (Lǎo Běijīng) style of Mandarin Chinese: "
    "natural Beijing dialect pronunciation with 儿化音, relaxed, slightly slangy tone. "
    "Make it sound authentic but still clear enough for learners.\n\n"
    "Voice Affect: Friendly, casual, and down-to-earth.\n\n"
    "Tone: Playful and lively, like a local Beijinger chatting.\n\n"
    "Pacing: Natural conversational rhythm, not too fast, with clear intonation.\n\n"
    "Emotion: Warm and humorous, expressive without being exaggerated.\n\n"
    "Pronunciation: Use Beijing dialect features such as 儿化音 (ér-suffix) and local slang when appropriate."
)

#INSTRUCTIONS_DEFAULT = INSTRUCTIONS_LAOBEIJING # If you want to use the Beijing dialect
INSTRUCTIONS_DEFAULT = (
    "Context: This audio will be used in a flashcard language-learning app. "
    "The user hears only this snippet in isolation, so pronunciation should be precise, clear, and slightly over-articulated. "
    "Avoid filler words or conversational extras. Deliver the phrase as if teaching correct pronunciation. "
    "Use standard Italian pronunciation (neutral, not strongly regional).\n\n"
    "Voice Affect: Calm, composed, and reassuring; project quiet authority and confidence.\n\n"
    "Tone: Sincere, empathetic, and gently authoritative—express genuine care while demonstrating competence.\n\n"
    "Pacing: Steady and moderate; unhurried enough for clarity, yet efficient enough to remain engaging.\n\n"
    "Emotion: Genuine warmth and encouragement; the delivery should feel supportive, as if helping someone learn with patience.\n\n"
    "Pronunciation: Clear and precise, slightly over-corrected to emphasize accurate articulation. "
    "Stress key syllables and word boundaries to reinforce correct learning. "
    "Pauses: Brief pauses after the snippet if necessary, highlighting that the unit is complete and self-contained."
)

def detect_delimiter(sample: str) -> str:
    return "," if sample.count(",") >= sample.count("\t") else "\t"

def safe_filename(name: str) -> str:
    name = name.strip()
    name = re.sub(r"[\\/:*?\"<>|]", "_", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name or "untitled"

def read_rows(csv_path: Path):
    text = csv_path.read_text(encoding="utf-8-sig")
    delim = detect_delimiter(text.splitlines()[0] if text else ",")
    reader = csv.reader(text.splitlines(), delimiter=delim)
    rows = list(reader)
    if rows and len(rows[0]) >= 3:
        header = [c.lower() for c in rows[0][:3]]
        if "chinese" in header[0] and "pinyin" in header[1] and "english" in header[2]:
            rows = rows[1:]
    return [r for r in rows if len(r) >= 3 and (r[0].strip() or r[1].strip())]

def build_tts_input(hanzi: str, pinyin: str, before: str, after: str) -> str:
    # We will still feed only Hanzi to the TTS "input" for clean audio.
    core = hanzi if hanzi else pinyin
    if before or after:
        return f"{before}{('“' + core + '”') if core else ''}{after}"
    return core

def build_instructions_with_pinyin_hint(pinyin: str | None, base: str, enabled: bool) -> str:
    if enabled and pinyin:
        # Explicit “do not read aloud” to reduce any chance of leakage
        return (base.rstrip() +
                f'\n\nSYSTEM NOTE (do not read aloud): Pinyin hint = "{pinyin}". '
                'Pronounce only the Chinese word; do not voice the romanization.')
    return base

def synthesize_wav(api_key: str, text: str, model: str, voice: str, instructions: str) -> bytes:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "voice": voice,
        "input": text,
        "format": "wav",
        "instructions": instructions or INSTRUCTIONS_DEFAULT,
    }
    r = requests.post(OPENAI_TTS_URL, headers=headers, data=json.dumps(payload), timeout=90)
    if r.status_code != 200:
        raise RuntimeError(f"TTS failed ({r.status_code}): {r.text[:300]}...")
    return r.content

def main():
    load_dotenv()
    ap = argparse.ArgumentParser(description="Generate WAVs from HSK CSV via OpenAI TTS (with teaching prompt).")
    ap.add_argument("csv", help="Path to CSV, e.g. data/hsk0.csv (or just 'hsk0' to auto-prepend .csv)")
    ap.add_argument("--out", default="tts_out_wav", help="Output directory (default: tts_out_wav)")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="OpenAI TTS model (e.g., gpt-4o-mini-tts, tts-1)")
    ap.add_argument("--voice", default=DEFAULT_VOICE, help="OpenAI TTS voice (e.g., alloy, verse, onyx...)")
    ap.add_argument("--before", default="", help='Optional text before core word (e.g., "这个词是")')
    ap.add_argument("--after",  default="", help='Optional text after core word (e.g., "。")')
    ap.add_argument("--instructions-file", help="Path to a .md/.txt file with TTS instructions")
    ap.add_argument("--instructions", help="Inline instructions override (short text)")
    ap.add_argument("--pinyin-hint", action="store_true", help="Append non-spoken Pinyin hint to instructions")
    ap.add_argument("--limit", type=int, default=0, help="Only process first N rows (0 = all)")
    ap.add_argument("--skip-existing", action="store_true", help="Skip files that already exist")
    ap.add_argument("--sleep", type=float, default=0.3, help="Sleep seconds between calls (default 0.3)")
    args = ap.parse_args()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        sys.exit("ERROR: OPENAI_API_KEY not set (env or .env).")

    # Resolve CSV path
    csv_path = Path(args.csv)
    if csv_path.suffix.lower() != ".csv":
        candidate1 = Path("data") / f"{csv_path.name}.csv"
        candidate2 = Path(f"{csv_path.name}.csv")
        if candidate1.exists(): csv_path = candidate1
        elif candidate2.exists(): csv_path = candidate2
        else: csv_path = Path(f"{csv_path}.csv")
    if not csv_path.exists():
        sys.exit(f"ERROR: CSV file not found: {csv_path}")

    out_dir = Path(args.out); out_dir.mkdir(parents=True, exist_ok=True)

    # Persist default instructions (handy for auditing)
    instructions_file_path = out_dir / "INSTRUCTIONS_DEFAULT.txt"
    instructions_file_path.write_text(INSTRUCTIONS_DEFAULT, encoding="utf-8")
    print(f"[TTS] Wrote instructions to: {instructions_file_path}")

    # Load base instructions (priority: inline > file > default)
    if args.instructions:
        base_instructions = args.instructions
    elif args.instructions_file:
        p = Path(args.instructions_file)
        if not p.exists(): sys.exit(f"ERROR: instructions file not found: {p}")
        base_instructions = p.read_text(encoding="utf-8")
    else:
        base_instructions = INSTRUCTIONS_DEFAULT

    rows = read_rows(csv_path)
    if not rows:
        sys.exit("No valid rows found (need at least 3 columns: Chinese, Pinyin, English).")

    total = len(rows) if args.limit <= 0 else min(args.limit, len(rows))
    print(f"[TTS] Input: {csv_path}   Rows: {len(rows)}   Will process: {total}")
    print(f"[TTS] Model: {args.model}   Voice: {args.voice}   Out: {out_dir.resolve()}")
    print(f"[TTS] Using instructions: {'inline' if args.instructions else ('file' if args.instructions_file else 'default')}, Pinyin hint: {args.pinyin_hint}")

    processed = 0
    for i, r in enumerate(rows):
        if processed >= total: break
        hanzi, pinyin, english = (r[0].strip(), r[1].strip(), r[2].strip())
        if not (hanzi or pinyin): continue

        base = safe_filename(hanzi if hanzi else pinyin)
        out_path = out_dir / f"{base}__{args.voice}__{args.model}.wav"
        if args.skip_existing and out_path.exists():
            print(f"  [{i+1:>4}] SKIP (exists): {out_path.name}")
            processed += 1; continue

        # Audio input: ONLY Hanzi (clean output)
        text_for_audio = hanzi if hanzi else pinyin

        # Instructions: base + optional Pinyin hint (not to be spoken)
        instructions_text = build_instructions_with_pinyin_hint(pinyin, base_instructions, args.pinyin_hint)
        if (i < 5):
            print(f"[TTS] Instructions: {instructions_text}")
            print(f"[TTS] Text for audio: {text_for_audio}")

        try:
            audio = synthesize_wav(api_key, text_for_audio, args.model, args.voice, instructions_text)
            out_path.write_bytes(audio)
            print(f"  [{i+1:>4}] OK  -> {out_path.name}")
            processed += 1
            if args.sleep > 0: time.sleep(args.sleep)
        except Exception as e:
            print(f"  [{i+1:>4}] FAIL: {e}")

    print(f"[TTS] Done. Generated {processed} WAV file(s).")

# Example:
# python dev_tools/make_tts_from_csv.py dev_tools/chinese_dev.csv --out dev_tools/audio_chinese_dev_with_laobeijing --model gpt-4o-mini-tts --voice alloy 
# python dev_tools/make_tts_from_csv.py data/eng_oliver.csv --out dev_tools/audio_eng_oliver --model gpt-4o-mini-tts --voice alloy 
# python dev_tools/make_tts_from_csv.py data/hsk1.csv --out dev_tools/audio_chinese_hsk1_wo_pinyin --model gpt-4o-mini-tts --voice alloy 

if __name__ == "__main__":
    main()