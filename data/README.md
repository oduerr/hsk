## Sound Generation


Creation of sound files
```
python dev_tools/make_tts_from_csv.py hsk7 --out dev_tools/audio_hsk7 --voice alloy --model gpt-4o-mini-tts --before "" --after "。" --skip-existing
```

Moving the files to the data directory
```
python dev_tools/transfer.py data/hsk7.csv dev_tools/audio_hsk7/ data/hsk7/
```
