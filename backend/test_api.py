import asyncio
import httpx

BASE_URL = "http://127.0.0.1:8000"

async def run_test():
    # Set a higher timeout tolerance for remote database networks
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Test root connection
        root_res = await client.get(f"{BASE_URL}/")
        print("Root Check:", root_res.json())

        # 2. Create a test merchant user account
        user_payload = {
            "name": "David Subway Manager",
            "email": "david.subway5@sunway.edu.my",  # Incremented to 4 to keep email unique
            "password_hash": "safepassword123",
            "role": "customer"
        }
        user_res = await client.post(f"{BASE_URL}/users", json=user_payload)
        user_data = user_res.json()
        print("Created User Data:", user_data)

        if "id" in user_data:
            user_uuid = user_data["id"]
            
            # 3. Create the storefront bound to that user ID
            merchant_payload = {
                "user_id": user_uuid,
                "name": "Subway Sunway Uni",
                "description": "Fresh sandwiches inside the main courtyard",
                "location": "Level 1, Block A"
              }
            merchant_res = await client.post(f"{BASE_URL}/merchants", json=merchant_payload)
            print("Created Merchant Status:", merchant_res.json())

        # 4. Read the market directory list back
        get_merchants = await client.get(f"{BASE_URL}/merchants")
        print("Live Merchant List:", get_merchants.json())

if __name__ == "__main__":
    asyncio.run(run_test())
