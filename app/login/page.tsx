import Link from "next/link";
import { login } from "./action";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 inline-flex items-center rounded border border-gray-800 bg-gray-900/70 px-2.5 py-1 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
        >
          ← home
        </Link>
        <h1 className="mb-6 text-center text-3xl font-bold tracking-tight text-gray-100">Chaos Intel</h1>
        <form action={login} className="space-y-4">
          <div>
            <label htmlFor="key" className="block text-sm text-gray-400 mb-1">
              Kingdom key
            </label>
            <input
              id="key"
              name="key"
              type="password"
              autoComplete="current-password"
              required
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500"
              placeholder="Enter your kingdom key"
            />
          </div>
          {error && (
            <p className="text-sm text-red-400">Key cannot be empty.</p>
          )}
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
