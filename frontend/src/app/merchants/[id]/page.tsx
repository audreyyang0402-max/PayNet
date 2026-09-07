// src/app/merchants/[id]/page.tsx
import AddToCartButton from "@/components/AddToCartButton";
import Link from "next/link";
import { fetchMerchantItems, MenuItem } from "@/lib/api";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

export default async function MerchantMenuPage({ params }: Props) {
  const { id } = await params;
  let items: MenuItem[] = [];
  let errorMessage = "";

  try {
    items = await fetchMerchantItems(id);
  } catch (error) {
    errorMessage = "Could not load menu items for this merchant.";
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-blue-600 hover:underline text-sm font-medium mb-6 inline-block">
          ← Back to All Merchants
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Merchant Menu</h1>
          <p className="text-gray-600 mt-1">Pick your favorites and get ready to preorder.</p>
        </header>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {errorMessage}
          </div>
        )}

        {items.length === 0 && !errorMessage ? (
          <p className="text-gray-500 bg-white p-6 rounded-xl border border-gray-200">
            This merchant hasn't added any menu items yet!
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => (
              <div 
                key={item.id} 
                className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm flex flex-col justify-between"
              >
                <div>
                  <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <span className="font-bold text-gray-900 text-lg">
                    RM {item.price.toFixed(2)}
                  </span>
                  
                  {/* Here is the updated button component! */}
                  <AddToCartButton item={item} />
                  
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}