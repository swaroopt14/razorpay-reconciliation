import Link from 'next/link'

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-slate-800">
      <h1 className="text-2xl font-semibold">Terms &amp; Conditions</h1>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">
        Placeholder terms page for the Zord console. Replace with your legal content before production.
      </p>
      <p className="mt-6">
        <Link href="/signin" className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      </p>
    </main>
  )
}
