export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-black text-gray-300 py-20 px-4 md:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="border-b border-emerald-900/50 pb-8">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            Terms of Service
          </h1>
          <p className="text-emerald-500/80">Last Updated: January 14, 2026</p>
        </div>

        <div className="space-y-6 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing and using POKROnline (pokronline.com), you accept
              and agree to be bound by the terms and provision of this
              agreement.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              2. No Real Money Gambling (Virtual Currency)
            </h2>
            <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-6 my-4">
              <p className="text-emerald-400 font-medium mb-2">
                POKROnline is strictly a social and educational gaming platform.
              </p>
              <ul className="list-disc pl-5 space-y-2 marker:text-emerald-600">
                <li>
                  <strong className="text-white">No Monetary Value:</strong>{" "}
                  "Chips," "coins," or any other virtual currency used on the
                  site have no real-world monetary value. They cannot be
                  exchanged for cash, goods, or services.
                </li>
                <li>
                  <strong className="text-white">No Cashout:</strong> You cannot
                  withdraw, sell, or transfer virtual currency to other players
                  or third parties.
                </li>
                <li>
                  <strong className="text-white">For Entertainment Only:</strong>{" "}
                  Any gameplay is intended solely for entertainment and
                  educational purposes. Success in POKROnline does not imply
                  future success in real-money gambling.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              3. User Accounts
            </h2>
            <p>
              To access certain features, you must register using a Google
              Account. You are responsible for maintaining the confidentiality of
              your account and are fully responsible for all activities that
              occur under your account. You agree to immediately notify us of
              any unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              4. Prohibited Conduct
            </h2>
            <p className="mb-2">You agree not to use the Service to:</p>
            <ul className="list-disc pl-5 space-y-2 marker:text-emerald-600">
              <li>
                Violate any local, state, national, or international law.
              </li>
              <li>
                Deploy bots, cheat, or collude with other players to manipulate
                gameplay.
              </li>
              <li>Harass, abuse, or harm another person.</li>
              <li>
                Upload or transmit viruses or any other type of malicious code.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              5. Intellectual Property
            </h2>
            <p>
              The Service and its original content (including the POKROnline
              logo, card assets, and software code) are and will remain the
              exclusive property of POKROnline.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              6. Termination
            </h2>
            <p>
              We may terminate or suspend your account immediately, without prior
              notice or liability, for any reason whatsoever, including without
              limitation if you breach the Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              7. Limitation of Liability
            </h2>
            <p>
              In no event shall POKROnline, nor its directors, employees,
              partners, agents, suppliers, or affiliates, be liable for any
              indirect, incidental, special, consequential or punitive damages,
              including without limitation, loss of profits, data, use,
              goodwill, or other intangible losses, resulting from your access to
              or use of or inability to access or use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              8. Governing Law
            </h2>
            <p>
              These Terms shall be governed and construed in accordance with the
              laws of Massachusetts, United States, without regard to its
              conflict of law provisions.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
