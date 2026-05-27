'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#09090B] text-white p-4">
      <h1 className="text-4xl font-bold mb-4">Something went wrong!</h1>
      <button
        onClick={() => reset()}
        className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl border border-white/10 transition-all"
      >
        Try again
      </button>
    </div>
  );
}
