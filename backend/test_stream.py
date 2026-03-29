import httpx

def test_stream():
    url = "http://localhost:8000/api/analyze?repo_id=08fe1d94"
    print(f"Connecting to {url}...")
    try:
        with httpx.stream("POST", url, timeout=120) as response:
            for line in response.iter_lines():
                print(line)
    except Exception as e:
        print("ERROR:", e)

if __name__ == "__main__":
    test_stream()
