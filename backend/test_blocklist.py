import requests

BASE_URL = "http://localhost:8000/api/blocklist"
HEADERS = {"x-user-id": "test-user-123", "Content-Type": "application/json"}

print("Testing Create Rule...")
res = requests.post(f"{BASE_URL}/", headers=HEADERS, json={
    "domain": "reddit.com",
    "mode": "soft",
    "avg_score_increase": 18
})
print(res.status_code, res.text)

print("\nTesting Get Rules...")
res = requests.get(f"{BASE_URL}/", headers=HEADERS)
print(res.status_code, res.text)

print("\nTesting Get Suggestions...")
res = requests.get(f"{BASE_URL}/suggestions", headers=HEADERS)
print(res.status_code, res.text)
