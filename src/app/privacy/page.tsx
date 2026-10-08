import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "Privacy policy for the Store Profit Tracker application.",
};

export default function PrivacyPage() {
  return (
    <div className="dashboard-canvas min-h-svh bg-background">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12 text-sm leading-relaxed">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            TS Trade
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Privacy policy
          </h1>
          <p className="mt-2 text-muted-foreground">
            Store Profit Tracker · Effective 8 October 2026
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Who we are</h2>
          <p>
            Store Profit Tracker is operated by TS Trade for our own business
            use. This policy explains what the app stores when you sign in and
            when you connect Shopify, eBay, Amazon, or QuickBooks.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Information we store</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Sign-in details for people we create in the app (email address and
              an authentication session).
            </li>
            <li>
              Order, customer, product, postage, and listing data pulled from
              Shopify, eBay, and Amazon so the dashboard can show sales and
              profit.
            </li>
            <li>
              QuickBooks company name and categorised transactions after you
              connect QuickBooks Online.
            </li>
            <li>
              Access and refresh tokens for services you connect, stored on our
              server so sync can run without asking you to sign in to those
              services every time.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">How we use it</h2>
          <p>
            We use this information to run the app: show orders and profit,
            print labels, sync fees and stock, and list QuickBooks transactions.
            We do not sell personal information. We do not use it for
            advertising.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Who can see it</h2>
          <p>
            Access is limited to people we give an account. Data is stored with
            our hosting and database providers (Vercel and Supabase) and is sent
            to the connected service only to perform the sync you asked for
            (Shopify, eBay, Amazon, or Intuit QuickBooks).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">How long we keep it</h2>
          <p>
            We keep order and accounting records while the app is in use.
            Disconnecting QuickBooks removes the stored QuickBooks connection.
            Sign-in accounts can be removed from our authentication settings.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Your choices</h2>
          <p>
            You can disconnect QuickBooks from the Accounting page. You can stop
            using the app at any time. To ask for a copy of stored information,
            or for it to be deleted, contact us using the details on{" "}
            <a
              href="https://tstrade.co.uk"
              className="text-primary hover:underline"
            >
              tstrade.co.uk
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Law</h2>
          <p>
            This policy is governed by the laws of England and Wales, including
            the UK GDPR where it applies.
          </p>
        </section>

        <p className="flex gap-4">
          <Link href="/eula" className="text-primary hover:underline">
            End-user license agreement
          </Link>
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
