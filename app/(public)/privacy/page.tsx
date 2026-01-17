export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-black text-gray-300 py-20 px-4 md:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="border-b border-emerald-900/50 pb-8">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-emerald-500/80">Last Updated: January 14, 2026</p>
        </div>

        <div className="space-y-6 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              1. Introduction
            </h2>
            <p>
              Welcome to POKROnline ("we," "our," or "us"). We respect your
              privacy and are committed to protecting your personal data. This
              privacy policy will inform you as to how we look after your
              personal data when you visit our website (pokronline.com) and tell
              you about your privacy rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              2. The Data We Collect
            </h2>
            <p className="mb-2">
              We may collect, use, store, and transfer different kinds of
              personal data about you which we have grouped together as follows:
            </p>
            <ul className="list-disc pl-5 space-y-2 marker:text-emerald-600">
              <li>
                <strong className="text-white">Identity Data:</strong> Includes
                first name, last name, and username (provided via Google
                Sign-In).
              </li>
              <li>
                <strong className="text-white">Contact Data:</strong> Includes
                email address (provided via Google Sign-In).
              </li>
              <li>
                <strong className="text-white">Technical Data:</strong> Includes
                internet protocol (IP) address, browser type and version, time
                zone setting and location, operating system and platform.
              </li>
              <li>
                <strong className="text-white">Usage Data:</strong> Includes
                information about how you use our website, such as poker hands
                played, game history, and win/loss statistics.
              </li>
              <li>
                <strong className="text-white">
                  Marketing and Communications Data:
                </strong>{" "}
                Includes data collected via tracking technologies such as the
                Meta (Facebook) Pixel.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              3. How We Collect Your Data
            </h2>
            <ul className="list-disc pl-5 space-y-2 marker:text-emerald-600">
              <li>
                <strong className="text-white">Direct Interactions:</strong> You
                may give us your Identity and Contact Data by signing in via
                Google Authentication.
              </li>
              <li>
                <strong className="text-white">
                  Automated Technologies:
                </strong>{" "}
                As you interact with our website, we may automatically collect
                Technical Data about your equipment and browsing actions using
                cookies and server logs.
              </li>
              <li>
                <strong className="text-white">Third Parties:</strong> We
                receive personal data about you from third parties, specifically
                Google (Auth/Analytics), Supabase (Database/Auth), and Meta
                (Facebook Pixel).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              4. How We Use Your Data
            </h2>
            <p>
              We will only use your personal data when the law allows us to.
              Most commonly, we will use your personal data to register you as a
              new user, facilitate gameplay/history, and improve our website
              services via analytics.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              5. Data Security
            </h2>
            <p>
              We have put in place appropriate security measures to prevent your
              personal data from being accidentally lost, used, or accessed in an
              unauthorized way. We use <strong className="text-white">Supabase</strong>{" "}
              for secure authentication and data storage.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              6. Third-Party Links
            </h2>
            <p>
              This website may include links to third-party websites. Clicking on
              those links may allow third parties to collect or share data about
              you. We do not control these third-party websites and are not
              responsible for their privacy statements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              7. Your Legal Rights
            </h2>
            <p>
              Under certain circumstances, you have rights under data protection
              laws in relation to your personal data, including the right to
              request access, correction, erasure, or to object to processing. To
              exercise any of these rights, please contact us at
              support@pokronline.com.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
