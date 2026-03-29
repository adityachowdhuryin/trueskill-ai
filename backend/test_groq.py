from dotenv import load_dotenv
load_dotenv()
from app.llm import get_llm_model

def test_groq():
    print("Testing Groq...")
    llm = get_llm_model()
    response = llm.invoke("Say hello world and do not output anything else.")
    print("RESPONSE:", response.content)

if __name__ == "__main__":
    test_groq()
