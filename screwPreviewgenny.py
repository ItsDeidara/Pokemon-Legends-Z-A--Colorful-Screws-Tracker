import json
import base64
import subprocess
import sys
import tempfile
from urllib.parse import urlparse, parse_qs
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / 'data' / 'data.json'
BACKUP_PATH = ROOT / 'data' / 'data.json.bak'
YOUTUBE_BASE = 'https://youtu.be/70mRtATTHDw'

# ensure we only print the choices menu once (prevents duplicate messages)
_CHOICES_PRINTED = False


def read_data():
    if not DATA_PATH.exists():
        print(f"Data file not found: {DATA_PATH}")
        sys.exit(1)
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_data(data):
    # backup
    try:
        if DATA_PATH.exists():
            DATA_PATH.rename(BACKUP_PATH)
    except Exception as e:
        print(f"Warning: could not create backup: {e}")
    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def timestamp_to_seconds(ts):
    if ts is None:
        return 0
    if isinstance(ts, int):
        return ts
    s = str(ts).strip()
    if s.isdigit():
        return int(s)
    parts = s.split(':')
    parts = [int(p) if p.isdigit() else 0 for p in parts]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 1:
        return parts[0]
    return 0


def ensure_tools():
    try:
        subprocess.run(['yt-dlp', '--version'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        print('yt-dlp not found. Install with: pip install yt-dlp')
        sys.exit(1)
    try:
        subprocess.run(['ffmpeg', '-version'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        print('ffmpeg not found. Install ffmpeg and ensure it is on PATH.')
        sys.exit(1)


def download_video(video_id, out_path):
    url = f'https://www.youtube.com/watch?v={video_id}'
    print(f'Downloading video {video_id}...')
    # Try a reasonable mp4-first selector, fall back to generic best if it fails
    try:
        subprocess.run(['yt-dlp', '-f', 'best[ext=mp4]/best', '-o', str(out_path), url], check=True)
        return
    except subprocess.CalledProcessError:
        print('Primary download format failed, attempting to list available formats...')

    # List available formats and prompt the user to choose one if necessary
    try:
        res = subprocess.run(['yt-dlp', '--list-formats', url], check=True, capture_output=True, text=True)
        formats_output = res.stdout
        # show a helpful slice of the formats
        print('\nAvailable formats (first 40 lines):\n')
        for i, line in enumerate(formats_output.splitlines()):
            if i >= 40:
                print('...')
                break
            print(line)
        # Attempt to auto-select a 1920x1080 mp4 video-only format (no audio needed)
        auto_fmt = None
        for line in formats_output.splitlines():
            l = line.lower()
            if '1920x1080' in l and 'mp4' in l:
                parts = line.strip().split()
                if parts:
                    code = parts[0]
                    # ensure it's a simple numeric code (not a combination)
                    if code.isdigit():
                        auto_fmt = code
                        break

        if auto_fmt:
            print(f"Auto-selected format {auto_fmt} (1920x1080 mp4)")
            subprocess.run(['yt-dlp', '-f', auto_fmt, '-o', str(out_path), url], check=True)
            return

        fmt = input('\nEnter a format code to try (or press Enter to abort): ').strip()
        if not fmt:
            raise subprocess.CalledProcessError(1, 'yt-dlp')
        print(f'Trying format {fmt}...')
        subprocess.run(['yt-dlp', '-f', fmt, '-o', str(out_path), url], check=True)
        return
    except subprocess.CalledProcessError as e:
        print('Video download failed. You can run: yt-dlp --list-formats <url> to inspect available formats.')
        raise


def extract_frame(video_path, seconds, output_path, resolution='1920x1080'):
    cmd = [
        'ffmpeg', '-ss', str(seconds), '-i', str(video_path), '-frames:v', '1', '-s', resolution, '-y', str(output_path)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def image_to_data_url(image_path):
    with open(image_path, 'rb') as f:
        b = f.read()
    mime = 'image/png'
    return f'data:{mime};base64,' + base64.b64encode(b).decode('utf-8')


def choose_items(data):
    global _CHOICES_PRINTED
    if not _CHOICES_PRINTED:
        print("\nChoices:\n 1) all - regenerate for every screw\n 2) missing - only screws where preview is empty\n 3) ids - comma list like 1,5,12")
        _CHOICES_PRINTED = True
    choice = input('Enter choice (all/missing/ids): ').strip().lower()
    if choice == 'all' or choice == '1':
        return [s['id'] for s in data]
    if choice == 'missing' or choice == '2':
        return [s['id'] for s in data if not s.get('preview')]
    if choice == 'ids' or choice == '3':
        raw = input('Enter comma-separated ids: ')
        ids = []
        for part in raw.split(','):
            try:
                ids.append(int(part.strip()))
            except Exception:
                pass
        return ids
    print('Unknown choice')
    return choose_items(data)


def main():
    ensure_tools()
    data = read_data()

    id_map = {int(item['id']): item for item in data}

    to_process = choose_items(data)
    if not to_process:
        print('No items selected.')
        return

    parsed = urlparse(YOUTUBE_BASE)
    if parsed.hostname == 'youtu.be':
        video_id = parsed.path.lstrip('/')
    else:
        q = parse_qs(parsed.query)
        video_id = q.get('v', [None])[0]
    if not video_id:
        print('Could not determine a video id from YOUTUBE_BASE. Please adjust YOUTUBE_BASE in script.')
        sys.exit(1)

    # Save the downloaded video in the same folder as data.json to avoid future downloads
    data_dir = DATA_PATH.parent
    video_file = data_dir / f'{video_id}.mp4'

    # If not present, ask the user whether to download
    if not video_file.exists():
        ans = input(f'Video {video_id} not found in cache. Download now? (y/n): ').strip().lower()
        if ans not in ('y', 'yes'):
            print('Aborting: video not available and download declined.')
            return

        # try download with retry prompt on failure
        while True:
            try:
                download_video(video_id, video_file)
                break
            except subprocess.CalledProcessError as e:
                print('Video download failed:', e)
                retry = input('Download failed. Retry? (y/n): ').strip().lower()
                if retry in ('y', 'yes'):
                    continue
                print('Aborting due to download failure.')
                return

    # Use a persistent frames directory inside data/ so frames are kept
    frames_dir = DATA_PATH.parent / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)
    processed = 0
    failed = []
    for sid in to_process:
            item = id_map.get(int(sid))
            if not item:
                failed.append(sid)
                continue
            ts = item.get('timestamp', '0:00')
            seconds = timestamp_to_seconds(ts)
            # Skip screws with timestamp 0:00 (considered uncompleted) without printing
            if seconds == 0:
                # intentionally silent for skipped items
                continue
            out_img = frames_dir / f'frame_{sid}.png'
            try:
                extract_frame(video_file, seconds, out_img)
                data_url = image_to_data_url(out_img)
                item['preview'] = data_url
                processed += 1
                print(f'[{sid}] preview generated')
            except Exception as e:
                print(f'[{sid}] failed: {e}')
                failed.append(sid)

    write_data(data)

    print(f"\nDone. Generated: {processed}. Failed: {len(failed)}.\n")
    if failed:
        print('Failed ids:', failed)


if __name__ == '__main__':
    main()