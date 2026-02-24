import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-brand-dark">
      <div className="text-center space-y-6 max-w-2xl px-6">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight">
            <span className="text-brand-green">FourTen</span> Markets
          </h1>
          <p className="text-xl text-muted-foreground">
            Propose your own odds. The exchange responds in real time.
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <Link
            href="/signup"
            className="px-6 py-3 bg-brand-green text-black font-semibold rounded-lg hover:bg-brand-green/90 transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 border border-border text-foreground font-semibold rounded-lg hover:bg-accent transition-colors"
          >
            Sign In
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-8 text-sm text-muted-foreground">
          <div className="p-4 rounded-lg bg-brand-surface border border-border">
            <div className="text-2xl font-bold text-brand-green mb-1">Accept</div>
            <div>Request better odds than market — we take it</div>
          </div>
          <div className="p-4 rounded-lg bg-brand-surface border border-border">
            <div className="text-2xl font-bold text-brand-gold mb-1">Counter</div>
            <div>We meet you at fair market value with our best offer</div>
          </div>
          <div className="p-4 rounded-lg bg-brand-surface border border-border">
            <div className="text-2xl font-bold text-brand-red mb-1">Reject</div>
            <div>Request too far off market — we protect our exposure</div>
          </div>
        </div>
      </div>
    </main>
  );
}
