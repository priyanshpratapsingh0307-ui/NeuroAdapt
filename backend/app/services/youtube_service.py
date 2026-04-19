from youtube_transcript_api import YouTubeTranscriptApi
import re


def extract_video_id(url: str) -> str:
    """
    Extracts the YouTube video ID from various URL formats.
    Supports: youtube.com/watch?v=, youtu.be/, youtube.com/embed/
    """
    patterns = [
        r"(?:v=)([0-9A-Za-z_-]{11})",
        r"(?:embed\/)([0-9A-Za-z_-]{11})",
        r"(?:youtu\.be\/)([0-9A-Za-z_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return ""


async def get_youtube_transcript(url: str) -> str:
    """
    Fetches the transcript/subtitles for a YouTube video.
    Uses youtube-transcript-api v1.2+ which exposes .fetch().
    Returns a single string with all transcript text joined.
    """
    video_id = extract_video_id(url)
    if not video_id:
        print(f"[YouTubeService] Could not extract video ID from: {url}")
        return ""

    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id)
        # .snippets is a list of FetchedTranscriptSnippet, each with .text
        full_text = " ".join([snippet.text for snippet in transcript.snippets])
        print(f"[YouTubeService] Transcript fetched for {video_id}: {len(full_text)} chars")
        return full_text
    except Exception as e:
        print(f"[YouTubeService] Error fetching transcript for {video_id}: {e}")
        return ""
