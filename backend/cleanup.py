# backend/cleanup.py
import asyncio
from sqlalchemy import text
from database import AsyncSessionLocal 

# The exact ID of the Subway that has your Chicken Katsu Sando
GOOD_STORE_ID = "49741a94-14a1-4b69-92aa-11323b0d4957"

async def clean_house():
    async with AsyncSessionLocal() as db:
        try:
            # 1. Nuke test orders and order items
            try:
                await db.execute(text("DELETE FROM order_items"))
                await db.execute(text("DELETE FROM orders"))
            except Exception:
                pass 
                
            # 2. Delete pickup slots linked to the bad merchants! (The missing piece)
            try:
                await db.execute(text("DELETE FROM pickup_slots WHERE merchant_id != :good_id"), {"good_id": GOOD_STORE_ID})
            except Exception:
                pass

            # 3. Delete the bad menu items
            await db.execute(text("DELETE FROM menu_items WHERE merchant_id != :good_id"), {"good_id": GOOD_STORE_ID})
            
            # 4. Finally, delete the bad merchants
            await db.execute(text("DELETE FROM merchants WHERE id != :good_id"), {"good_id": GOOD_STORE_ID})
            
            await db.commit()
            print("🧹 Cleaned house! Nuked the pickup slots, test orders, and duplicate stores.")
        except Exception as e:
            print(f"Error during cleanup: {e}")
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(clean_house())