import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "End-user license agreement",
  description:
    "End-user license agreement for the Store Profit Tracker application.",
};

export default function EulaPage() {
  return (
    <div className="dashboard-canvas min-h-svh bg-background">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12 text-sm leading-relaxed">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            TS Trade
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            End-user license agreement
          </h1>
          <p className="mt-2 text-muted-foreground">
            Store Profit Tracker · Effective 8 October 2026
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">1. Agreement</h2>
          <p>
            This end-user license agreement (“Agreement”) is between TS Trade
            (“we”, “us”) and the person or business that accesses Store Profit
            Tracker (the “App”). By signing in or using the App, you agree to
            this Agreement. If you do not agree, do not use the App.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">2. Licence</h2>
          <p>
            We grant you a limited, non-exclusive, non-transferable licence to
            use the App for your own business, to view orders, costs, listings,
            and connected accounting data. You do not receive ownership of the
            App, its code, or its design.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">3. Connected services</h2>
          <p>
            The App can connect to services you authorise, including Shopify,
            eBay, Amazon, and QuickBooks Online. You are responsible for the
            accounts you connect and for keeping those credentials accurate. We
            use connected data only to operate the features you turn on, such
            as showing orders, fees, listings, and QuickBooks transactions
            inside the App.
          </p>
          <p>
            QuickBooks data is read after you approve access. Items that remain
            uncategorised in QuickBooks are not imported. You can disconnect
            QuickBooks from the Accounting page at any time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">4. Restrictions</h2>
          <p>You must not:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>copy, resell, or sublicense the App;</li>
            <li>reverse engineer the App except where the law allows it;</li>
            <li>use the App to access another person’s accounts without permission;</li>
            <li>interfere with the App, its hosting, or its connected APIs.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">5. Your data</h2>
          <p>
            Order, product, and accounting records shown in the App remain
            yours. We store what the App needs to run (including OAuth tokens
            for services you connect) so the App can sync on your behalf. Do
            not share your sign-in details.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">6. Availability and warranty</h2>
          <p>
            The App is provided “as is”. Figures such as profit, fees, and
            imported transactions are aids for your records and may differ from
            Shopify, eBay, Amazon, QuickBooks, or your bank. You should check
            important figures in the source system before relying on them. We
            do not warrant that the App will be uninterrupted or error-free.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">7. Liability</h2>
          <p>
            To the extent permitted by law, we are not liable for lost profits,
            lost data, or indirect or consequential loss arising from use of
            the App or from a connected service. Nothing in this Agreement
            limits liability that cannot legally be limited.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">8. Ending the licence</h2>
          <p>
            You may stop using the App at any time and disconnect connected
            services. We may suspend access if the App is misused or if access
            credentials are compromised. Sections that should survive (including
            liability limits) continue after the licence ends.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">9. Law</h2>
          <p>
            This Agreement is governed by the laws of England and Wales. The
            courts of England and Wales have exclusive jurisdiction.
          </p>
        </section>

        <p className="text-muted-foreground">
          Questions about this agreement: use the contact details published on{" "}
          <a
            href="https://tstrade.co.uk"
            className="text-primary hover:underline"
          >
            tstrade.co.uk
          </a>
          .
        </p>

        <p className="flex gap-4">
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy policy
          </Link>
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
