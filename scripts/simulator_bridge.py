import json
import sys
import base64
import os
import traceback

# Ensure project root is on sys.path so we can import simulator_test_2.py
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

try:
    from simulator_test_2 import VoicePhishingSimulator
except Exception as e:
    VoicePhishingSimulator = None
    _import_error = str(e)

simulators = {}


def write_response(obj):
    # Avoid UnicodeEncodeError on surrogate characters by sanitizing strings.
    def _clean(val):
        if isinstance(val, str):
            return val.encode("utf-8", errors="replace").decode("utf-8")
        if isinstance(val, list):
            return [_clean(v) for v in val]
        if isinstance(val, dict):
            return {k: _clean(v) for k, v in val.items()}
        return val

    safe = _clean(obj)
    payload = json.dumps(safe, ensure_ascii=False) + "\n"
    sys.stdout.buffer.write(payload.encode("utf-8", errors="replace"))
    sys.stdout.flush()


def ensure_simulator(session_id, user_profile_json):
    if VoicePhishingSimulator is None:
        raise RuntimeError(f"Failed to import simulator_test_2.py: {_import_error}")
    if session_id not in simulators:
        simulators[session_id] = VoicePhishingSimulator(user_profile_json)
    return simulators[session_id]


def handle_init(req):
    session_id = req.get("sessionId")
    user_profile = req.get("userProfile")
    if session_id is None or user_profile is None:
        raise ValueError("sessionId and userProfile are required for init")
    ensure_simulator(session_id, user_profile)
    return {"ok": True}


def handle_chat(req):
    session_id = req.get("sessionId")
    user_input = req.get("userInput")
    user_profile = req.get("userProfile")
    if session_id is None or user_input is None:
        raise ValueError("sessionId and userInput are required for chat")
    sim = ensure_simulator(session_id, user_profile or '{"user_profile": {"name": "사용자", "scenario_type": "default"}}')
    response_text, status, audio_bytes = sim.chat_turn(user_input)
    audio_b64 = None
    if audio_bytes is not None:
        try:
            audio_b64 = base64.b64encode(audio_bytes.getvalue()).decode("ascii")
        except Exception:
            try:
                audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
            except Exception:
                audio_b64 = None
    return {
        "ok": True,
        "responseText": response_text,
        "status": status,
        "audioBase64": audio_b64,
    }


def _fetch_audio_bytes(url: str) -> bytes:
    import urllib.request
    with urllib.request.urlopen(url) as resp:
        data = resp.read()
        sys.stderr.write(f"STT_FETCH ok bytes={len(data)}\n")
        sys.stderr.flush()
        return data


def handle_transcribe(req):
    session_id = req.get("sessionId")
    audio_url = req.get("audioUrl")
    user_profile = req.get("userProfile")
    if session_id is None or not audio_url:
        raise ValueError("sessionId and audioUrl are required for transcribe")
    sim = ensure_simulator(session_id, user_profile or '{"user_profile": {"name": "사용자", "scenario_type": "default"}}')
    try:
        audio_bytes = _fetch_audio_bytes(audio_url)
    except Exception as e:
        sys.stderr.write(f"STT_FETCH error: {e}\n")
        sys.stderr.flush()
        raise
    transcript = sim.transcribe_audio(audio_bytes)
    sys.stderr.write(f"STT_TRANSCRIPT: {transcript}\n")
    sys.stderr.flush()
    return {"ok": True, "transcript": transcript}


def handle_feedback(req):
    session_id = req.get("sessionId")
    user_profile = req.get("userProfile")
    if session_id is None:
        raise ValueError("sessionId is required for feedback")
    sim = ensure_simulator(session_id, user_profile or '{"user_profile": {"name": "사용자", "scenario_type": "default"}}')
    feedback = sim.get_feedback()
    return {"ok": True, "feedback": feedback}


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        req_id = req.get("id")
        action = req.get("action")
        if action == "init":
            data = handle_init(req)
        elif action == "chat":
            data = handle_chat(req)
        elif action == "transcribe":
            data = handle_transcribe(req)
        elif action == "feedback":
            data = handle_feedback(req)
        else:
            raise ValueError("Unknown action")
        data["id"] = req_id
        write_response(data)
    except Exception as e:
        sys.stderr.write("SIMULATOR_BRIDGE_ERROR:\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        write_response({"id": req.get("id") if "req" in locals() else None, "ok": False, "error": str(e)})
