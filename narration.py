"""On-demand, two-character AI narration for the six fixed workshop scenes.

Uses only stdlib; API key remains on the server. One combined WAV is generated and
cached per scene so repeated plays do not repeatedly call the speech API.
"""
import io
import json
import os
import tempfile
import threading
import urllib.error
import urllib.request
import wave
from pathlib import Path

# Each voice is chosen to fit the characters depicted in the corresponding scenario image.
# Scene 4 has a feminine-sounding employee; scene 5 has a feminine-sounding moderator.
# The other illustrated speakers use masculine-sounding voices. These are synthetic
# performances, not replicas of the real people shown in the pictures.
EMPLOYEE_VOICES = ('onyx', 'echo', 'ash', 'nova', 'fable', 'verse')
MODERATOR_VOICES = ('echo', 'onyx', 'echo', 'onyx', 'shimmer', 'onyx')
EMPLOYEE_DIRECTIONS = (
    'Hopeful but slightly frustrated about career advancement.',
    'Tired, candid and disheartened, not theatrical.',
    'An accomplished employee who sounds interested and capable but sincerely concerned about the added time commitment and maintaining work-life balance. Calm, candid, thoughtful; avoid sounding fearful or theatrical.',
    'Frustrated about vague feedback, asking for clarity.',
    'A little hesitant and worried about disappointing a manager.',
    'Uncertain about the future, thoughtful and sincere.',
)
CACHE_DIR = Path(os.environ.get('SCENE_AUDIO_CACHE_DIR', str(Path(tempfile.gettempdir()) / 'career-game-voices-v3')))
LOCKS = [threading.Lock() for _ in EMPLOYEE_VOICES]
MAX_WAV_BYTES = 6_000_000


class NarrationError(Exception):
    def __init__(self, message, status=503):
        super().__init__(message)
        self.status = status


def moderator_text(scenario):
    return "You're the manager in this conversation. " + scenario['question'] + " How would you respond?"


def _generate_voice(text, voice, guidance):
    api_key = os.environ.get('OPENAI_API_KEY', '').strip()
    if not api_key:
        raise NarrationError('Studio narration is not configured. Use device voices instead.')
    payload = {
        'model': os.environ.get('OPENAI_TTS_MODEL', 'gpt-4o-mini-tts'),
        'voice': voice,
        'input': text,
        'instructions': guidance,
        'response_format': 'wav',
    }
    req = urllib.request.Request(
        'https://api.openai.com/v1/audio/speech',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + api_key, 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=70) as response:
            result = response.read(MAX_WAV_BYTES + 1)
    except urllib.error.HTTPError as exc:
        # Don't expose provider response bodies or token values in public responses.
        raise NarrationError('Studio narration was declined by OpenAI (HTTP %s). Try device voices or check API billing and model access.' % exc.code, 502) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise NarrationError('The studio narrator could not reach OpenAI. Try device voices.', 502) from exc
    if len(result) > MAX_WAV_BYTES or not result.startswith(b'RIFF'):
        raise NarrationError('Studio narration did not produce valid audio. Try device voices.', 502)
    return result


def _join_wav(employee_wav, moderator_wav):
    """Join two PCM WAVs, with a short silence between speakers."""
    try:
        with wave.open(io.BytesIO(employee_wav), 'rb') as a, wave.open(io.BytesIO(moderator_wav), 'rb') as b:
            a_params = (a.getnchannels(), a.getsampwidth(), a.getframerate(), a.getcomptype())
            b_params = (b.getnchannels(), b.getsampwidth(), b.getframerate(), b.getcomptype())
            if a_params != b_params or a.getcomptype() != 'NONE':
                raise NarrationError('Narration audio formats did not match. Try device voices.', 502)
            channels, width, rate, _ = a_params
            audio1, audio2 = a.readframes(a.getnframes()), b.readframes(b.getnframes())
            pause = b'\0' * int(rate * 0.65) * channels * width
            buffer = io.BytesIO()
            with wave.open(buffer, 'wb') as output:
                output.setnchannels(channels)
                output.setsampwidth(width)
                output.setframerate(rate)
                output.writeframes(audio1 + pause + audio2)
            return buffer.getvalue()
    except (wave.Error, EOFError, ValueError) as exc:
        raise NarrationError('Studio narration returned an unsupported audio format. Try device voices.', 502) from exc


def get_scenario_wav(scenario, index):
    if not 0 <= index < len(EMPLOYEE_VOICES):
        raise NarrationError('Unknown scenario.', 404)
    employee_style = scenario.get('employee_voice_style', 'male')
    moderator_style = scenario.get('moderator_voice_style', 'male')
    if employee_style not in ('male', 'female') or moderator_style not in ('male', 'female'):
        raise NarrationError('Invalid narration voice configuration.', 500)
    filename = CACHE_DIR / ('scenario-%s-v1.wav' % (index + 1))
    with LOCKS[index]:
        if filename.is_file():
            return filename.read_bytes()
        employee = _generate_voice(
            scenario['employee'], EMPLOYEE_VOICES[index],
            'Act as an employee in a realistic private workplace conversation. '
            'Speak naturally, personally and conversationally, in a natural ' +
            ('masculine' if employee_style == 'male' else 'feminine') +
            ' adult voice matching the employee pictured. ' + EMPLOYEE_DIRECTIONS[index] +
            ' Speak only the supplied words; do not add a speaker label.'
        )
        moderator = _generate_voice(
            moderator_text(scenario), MODERATOR_VOICES[index],
            'Act as a calm, confident workshop moderator addressing managers. '
            'Speak with a natural ' + ('masculine' if moderator_style == 'male' else 'feminine') +
            ' adult voice matching the listener pictured. Use an inviting, clear, thoughtful tone. '
            'Pause naturally before the closing question. Speak only the supplied words; '
            'do not add a speaker label.'
        )
        combined = _join_wav(employee, moderator)
        if len(combined) > 15_000_000:
            raise NarrationError('Narration audio was too large. Try device voices.', 502)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp_path = filename.with_suffix('.tmp')
        try:
            tmp_path.write_bytes(combined)
            os.replace(tmp_path, filename)
        finally:
            if tmp_path.exists():
                tmp_path.unlink()
        print('Studio narration cached: scene %s' % (index + 1), flush=True)
        return combined
