## Sound Generation


Sound files were created using the OpenAI API.
I played around with the OpenAI TTS API and found that the best results are achieved when not providing the pinyin. 
The prompt in `..dev_tools/make_tts_from_csv.py` can be tested in [https://www.openai.fm/](https://www.openai.fm/)

#### Creating WAV Files:

#### Creating WAV Files for HSK5:
```
python dev_tools/make_tts_from_csv.py data/hsk5.csv --out dev_tools/audio_chinese_hsk5_wo_pinyin --model gpt-4o-mini-tts --voice alloy --skip
```
Moving the files to the data directory

```
python dev_tools/transfer.py data/hsk5.csv dev_tools/audio_chinese_hsk5_wo_pinyin data/recordings/zh-CN
```

#### Creating WAV Files for Chinese Oliver:
```
python dev_tools/make_tts_from_csv.py data/chinese_oliver.csv --out dev_tools/audio_chinese_oliver_wo_pinyin --model gpt-4o-mini-tts --voice alloy --skip
```
```
python dev_tools/transfer.py data/chinese_oliver.csv dev_tools/audio_chinese_oliver_wo_pinyin data/recordings/zh-CN
```



