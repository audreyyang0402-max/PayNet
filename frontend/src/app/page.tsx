// frontend/src/app/page.tsx
import Link from "next/link";
import { fetchMerchants, Merchant } from "@/lib/api";

export default async function Home() {
  let merchants: Merchant[] = [];
  let errorMessage = "";

  try {
    merchants = await fetchMerchants();
  } catch (error) {
    errorMessage = "Could not connect to the FastAPI backend. Make sure uvicorn is running!";
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Sunway Express Lane</h1>
          <p className="text-gray-600 mt-1">Preorder your campus meals and skip the queue.</p>
        </header>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {errorMessage}
          </div>
        )}

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Available Campus Merchants</h2>
          
          {merchants.length === 0 && !errorMessage ? (
            <p className="text-gray-500">No active merchants found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {merchants.map((merchant) => (
                <Link href={`/merchants/${merchant.id}`} key={merchant.id} className="block group">
                  <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm group-hover:shadow-md transition-shadow">
                    <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">{merchant.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{merchant.description}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                        📍 {merchant.location}
                      </span>
                      <span className="text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                        Open
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}