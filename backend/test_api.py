import uuid
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
            "email": f"david.subway.{uuid.uuid4().hex[:6]}@sunway.edu.my",
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
            merchant_data = merchant_res.json()
            print("Created Merchant Status:", merchant_data)

            # Extract the merchant ID for use in the next steps
            if "id" in merchant_data:
                merchant_uuid = merchant_data["id"]

                # 5. Create a menu item under that merchant
                item_payload = {
                    "name": "Chicken Katsu Sando",
                    "description": "Crispy chicken cutlet sandwich with tonkatsu sauce",
                    "price": 8.90,
                    "image_url": None,
                    "is_available": True
                }
                item_res = await client.post(f"{BASE_URL}/merchants/{merchant_uuid}/items", json=item_payload)
                item_data = item_res.json()
                print("Created Menu Item:", item_data)

                # 6. Read back the menu items for that merchant
                get_items_res = await client.get(f"{BASE_URL}/merchants/{merchant_uuid}/items")
                print("Live Menu Items:", get_items_res.json())

                            # 7. Create a pickup slot for that merchant
                from datetime import datetime, timedelta
                slot_payload = {
                    "time_slot": (datetime.utcnow() + timedelta(hours=2)).isoformat(),
                    "max_capacity": 5
                }
                slot_res = await client.post(f"{BASE_URL}/merchants/{merchant_uuid}/pickup-slots", json=slot_payload)
                slot_data = slot_res.json()
                print("Created Pickup Slot:", slot_data)

                if "id" in slot_data and "id" in item_data:
                    slot_uuid = slot_data["id"]

                    # 8. Place an order (checkout) using that item and slot
                    order_payload = {
                        "customer_id": user_uuid,
                        "merchant_id": merchant_uuid,
                        "pickup_slot_id": slot_uuid,
                        "items": [
                            {"menu_item_id": item_data["id"], "quantity": 2}
                        ]
                    }
                    order_res = await client.post(f"{BASE_URL}/orders", json=order_payload)
                    order_data = order_res.json()
                    print("Created Order:", order_data)

                    # 9. Read the order back with its line items
                    if "id" in order_data:
                        get_order_res = await client.get(f"{BASE_URL}/orders/{order_data['id']}")
                        print("Order Details:", get_order_res.json())

                    # 9b. List this customer's order history (newest first)
                    history_res = await client.get(f"{BASE_URL}/users/{user_uuid}/orders")
                    print("Order History:", history_res.status_code, history_res.json())

                                            # 10. Create a HitPay payment request for that order
                    if "id" in order_data:
                        pay_res = await client.post(f"{BASE_URL}/orders/{order_data['id']}/pay")
                        print("Payment Request:", pay_res.json())

        # 4. Read the market directory list back
        get_merchants = await client.get(f"{BASE_URL}/merchants")
        print("Live Merchant List:", get_merchants.json())

if __name__ == "__main__":
    asyncio.run(run_test())