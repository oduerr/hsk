# Audio Recordings Directory

This directory contains audio recordings organized by locale for better organization and to avoid filename conflicts.

## Directory Structure

```
data/recordings/
├── en-US/          # English (US) recordings
├── zh-CN/          # Chinese (Simplified) recordings  
├── it-IT/          # Italian recordings
└── README.md       # This file
```

## File Naming Convention

- **English recordings**: `./data/recordings/en-US/hello.wav`
- **Chinese recordings**: `./data/recordings/zh-CN/你好.wav`
- **Italian recordings**: `./data/recordings/it-IT/ciao.wav`

## How It Works

The application automatically detects the current session's locale and looks for audio files in the appropriate subdirectory first. If no locale-specific file is found, it falls back to the general `recordings/` directory.

## Moving Your Files

1. **Chinese HSK recordings**: Move to `data/recordings/zh-CN/`
2. **English vocabulary**: Move to `data/recordings/en-US/`
3. **Italian vocabulary**: Move to `data/recordings/it-IT/`
4. **General/fallback recordings**: Keep in `data/recordings/` (root)

## Benefits

- ✅ **No filename conflicts** between different languages
- ✅ **Better organization** by language/locale
- ✅ **Automatic detection** based on session locale
- ✅ **Fallback support** for general recordings
- ✅ **Easy to maintain** and add new languages
