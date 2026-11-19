import Link from "next/link";

export const metadata = { title: "Data Security & Privacy — CashCall", description: "How CashCall keeps your restaurant's financial data private, isolated, and encrypted." };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-10">
    <h2 className="text-lg font-bold text-white mb-4">{title}</h2>
    {children}
  </div>
);

const Fact = ({ icon, title, body }: { icon: string; title: string; body: string }) => (
  <div className="flex gap-4 p-4 rounded-xl mb-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
    <div className="text-2xl shrink-0">{icon}</div>
    <div>
      <div className="text-sm font-semibold text-white mb-1">{title}</div>
      <div className="text-sm text-gray-400 leading-relaxed">{body}</div>
    </div>
  </div>
);

export default function SecurityPage() {
  return (
    <div className="min-h-screen px-4 py-14" style={{ background: "#060b18" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <Link href="/" className="text-sm text-teal-500 hover:text-teal-400 transition-colors mb-8 inline-block">← cashcall.io</Link>
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-4"
            style={{ background: "rgba(0,212,168,0.1)", border: "1px solid rgba(0,212,168,0.2)", color: "#00d4a8" }}>
            🔐 Security & Privacy
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Your data is yours. Period.</h1>
          <p className="text-gray-400 leading-relaxed">
            CashCall was built for restaurant operators who can't afford a data breach — financially or reputationally.
            Here's exactly how we protect your information, in plain language.
          </p>
        </div>

        {/* Zero-knowledge encryption */}
        <Section title="Zero-knowledge encryption">
          <p className="text-gray-400 text-sm leading-relaxed mb-4">
            Every piece of financial data — invoices, payroll, sales, food costs — is encrypted with a 256-bit AES key
            before it leaves your browser. That key is generated on your device and never transmitted to our servers.
          </p>
          <Fact icon="🔑" title="We never see your key"
            body="Your encryption key is generated in your browser using the Web Crypto API. It never travels over the network. Even our engineers cannot read your data." />
          <Fact icon="🏛" title="Government subpoenas get encrypted gibberish"
            body="If a court ordered us to hand over your data, we would hand over encrypted ciphertext. Without your key it is mathematically unreadable." />
          <Fact icon="✓" title="AES-256-GCM"
            body="The same encryption standard used by the US Department of Defense, major banks, and Signal. Breaking it with today's hardware would take longer than the age of the universe." />
        </Section>

        {/* Database isolation */}
        <Section title="Database-level account isolation">
          <p className="text-gray-400 text-sm leading-relaxed mb-4">
            Even beyond encryption, your raw data is isolated from every other account at the database row level using
            Postgres Row Level Security (RLS). This is enforced by the database engine itself — not just application code.
          </p>
          <Fact icon="🛡" title="Row Level Security on every table"
            body="Every query your browser makes is automatically filtered to only your data by the database. A bug in our application code cannot leak another client's data — the database enforces the boundary." />
          <Fact icon="🔒" title="Your session token is the only key"
            body="When you log in, Supabase issues a JWT (JSON Web Token) signed with your user ID. Every database query uses this token to enforce ownership. Logging out immediately revokes access." />
          <Fact icon="👁" title="No employee access through the app"
            body="CashCall engineers use admin tools for operations and billing only — not the client-facing application. There is no 'admin view' of your dashboard." />
        </Section>

        {/* Encryption in transit */}
        <Section title="Encryption in transit and at rest">
          <Fact icon="🌐" title="TLS 1.3 everywhere"
            body="All data between your browser and our servers travels over TLS 1.3 — the same protocol used by your bank. There is no unencrypted path." />
          <Fact icon="💾" title="AES-256 at rest"
            body="Supabase stores all database data encrypted at rest on AWS infrastructure using AES-256. Even a physical disk theft yields nothing readable." />
          <Fact icon="☁" title="AWS infrastructure"
            body="CashCall runs on Vercel (frontend) and Supabase (database) — both hosted on AWS data centers with SOC 2 Type II certification and physical access controls." />
        </Section>

        {/* How invites work */}
        <Section title="Invite-only access">
          <p className="text-gray-400 text-sm leading-relaxed mb-4">
            CashCall is not open to public signup. Every account is created through a personal invite link generated specifically for you.
          </p>
          <Fact icon="🎫" title="Single-use invite links"
            body="Your invite link is a cryptographically random UUID that expires in 30 days and can only be used once. Once your account is created, the link is permanently invalidated." />
          <Fact icon="🚫" title="No shared credentials"
            body="Each account has its own isolated database scope. There are no shared logins, shared demo accounts, or any data shared between clients." />
        </Section>

        {/* Your rights */}
        <Section title="Your data rights">
          <div className="space-y-3">
            {[
              { right: "Export", desc: "You can request a full export of all your data at any time. We will deliver it as a JSON file within 24 hours." },
              { right: "Delete", desc: "You can request permanent deletion of your account and all associated data. Deletion is irreversible and completed within 72 hours." },
              { right: "Portability", desc: "Your data belongs to you. We will never sell it, share it with third parties for advertising, or use it to train AI models without your explicit consent." },
              { right: "Transparency", desc: "We will notify you within 72 hours of any confirmed security incident that affects your account." },
            ].map(({ right, desc }) => (
              <div key={right} className="flex gap-3 text-sm">
                <span className="text-teal-400 font-semibold shrink-0 w-20">{right}</span>
                <span className="text-gray-400">{desc}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Contact */}
        <div className="rounded-2xl p-6 border mt-8" style={{ background: "rgba(0,212,168,0.04)", borderColor: "rgba(0,212,168,0.2)" }}>
          <div className="text-sm font-semibold text-white mb-1">Questions about security?</div>
          <p className="text-sm text-gray-400 mb-3">We're happy to walk you through our architecture on a call before you sign up.</p>
          <a href="mailto:security@cashcall.io" className="text-teal-400 text-sm hover:text-teal-300 transition-colors">security@cashcall.io →</a>
        </div>

        <div className="mt-10 text-center text-xs text-gray-700">
          Last updated October 2026 · <Link href="/" className="hover:text-gray-500 transition-colors">cashcall.io</Link>
        </div>
      </div>
    </div>
  );
}
