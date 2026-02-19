#!/usr/bin/env python3
import json, re, urllib.request

with open("/opt/ai-dashboard/ecosystem.config.js") as f:
    content = f.read()
m = re.search(r"OPENAI_API_KEY.*?'([^']*sk-[^']*)'", content)
key = m.group(1) if m else ""
print("Key found:", key[:20] + "...")

req = urllib.request.Request(
    "https://api.openai.com/v1/responses",
    data=json.dumps({
        "model": "gpt-4o-mini",
        "tools": [{"type": "web_search_preview"}],
        "input": "latest tech news February 19 2026"
    }).encode(),
    headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
)
try:
    resp = urllib.request.urlopen(req, timeout=45)
    data = json.loads(resp.read())
    print("Full output types:", [o.get("type") for o in data.get("output", [])])
    for o in data.get("output", []):
        if o.get("type") == "message":
            for c in o.get("content", []):
                if c.get("type") == "output_text":
                    print("SEARCH RESULT:", c["text"][:800])
        elif o.get("type") == "web_search_call":
            print("SEARCH CALL:", o.get("status"), o.get("id"))
except Exception as e:
    print("ERROR:", e)
    import traceback
    traceback.print_exc()
