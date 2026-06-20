import requests
import json
import time

BASE_URL_USERS = "http://localhost:8000/api/users"
BASE_URL_TASKS = "http://localhost:8000/api/tasks"

print("0. Create User")
res = requests.post(f"{BASE_URL_USERS}/register", json={"user_id": "test-user-123", "name": "Test User"})
print(res.status_code, res.text)

HEADERS = {"x-user-id": "test-user-123", "Content-Type": "application/json"}

print("\n1. Testing Task Anchor Start...")
res = requests.post(f"{BASE_URL_TASKS}/anchor", headers=HEADERS, json={"task_name": "Read documentation"})
print(res.status_code, res.text)
data = res.json()
task_id = data.get("task_anchor_id")

if task_id:
    print("\n2. Testing Task Drift Event...")
    res = requests.post(f"{BASE_URL_TASKS}/drift", headers=HEADERS, json={
        "task_anchor_id": task_id,
        "task_name": "Read documentation",
        "site_url": "https://youtube.com",
        "page_title": "YouTube",
        "action_taken": "alert_shown"
    })
    print(res.status_code, res.text)

    print("\n3. Testing Task Anchor Complete...")
    res = requests.post(f"{BASE_URL_TASKS}/anchor/{task_id}/complete", headers=HEADERS)
    print(res.status_code, res.text)
else:
    print("Failed to get task ID")
