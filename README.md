# Store Profit Tracker

Next.js app to import Shopify orders and track revenue, costs, and profit across eBay, Amazon, and your store.

## Stack

- **Next.js** (App Router) + TypeScript
- **Tailwind CSS** v4 + **shadcn/ui**
- **Shopify Admin API** — order sync
- **Supabase** — order storage
- **eBay Finances API** — OAuth (optional, for real fees)

## Local development

```bash
npm install
cp .env.example .env.local
# Fill in Shopify + Supabase credentials (see .env.example)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

### 1. Push to GitHub

Create an empty repo on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin master
```

### 2. Import in Vercel

1. [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo
2. Framework: **Next.js** (auto-detected)
3. Add **Environment Variables** (copy from your `.env.local`):

| Variable | Required |
|----------|----------|
| `SHOPIFY_STORE_DOMAIN` | Yes |
| `SHOPIFY_CLIENT_ID` | Yes |
| `SHOPIFY_CLIENT_SECRET` | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server sync) |
| `EBAY_CLIENT_ID` | For eBay fees |
| `EBAY_CLIENT_SECRET` | For eBay fees |
| `EBAY_RU_NAME` | For eBay fees |
| `EBAY_ENV` | `sandbox` or `production` |
| `EBAY_REFRESH_TOKEN` | After OAuth (see below) |

4. Deploy

### 3. Custom domain

In Vercel → **Project → Settings → Domains**, add your domain and follow DNS instructions.

### 4. eBay OAuth on production

In the [eBay Developer Portal](https://developer.ebay.com/my/keys), set your RuName URLs to **HTTPS** on your Vercel domain:

- **Auth accepted URL:** `https://YOUR_DOMAIN/api/ebay/oauth/callback`
- **Privacy policy URL:** `https://YOUR_DOMAIN` (or a real policy page)

Then open `https://YOUR_DOMAIN/settings` → **Connect eBay account**.

**Important:** Vercel has no persistent disk. After connecting eBay, copy the refresh token into Vercel env vars:

1. Connect locally once (or check `data/ebay-oauth.json` after connect)
2. Vercel → **Settings → Environment Variables** → add `EBAY_REFRESH_TOKEN`
3. Redeploy

Alternatively, set `EBAY_REFRESH_TOKEN` before connecting if you already have one from eBay.

## Shopify setup

1. [Partners app](https://partners.shopify.com) or custom app with **Admin API** scope `read_orders`
2. Add `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` to env
3. Install the app on your store

See **Settings** in the app to test the Shopify connection.

### Open inside Shopify admin (fix “Example Domain”)

If the app appears under **Apps** in Shopify admin but shows **Example Domain**, the Partners app URL is still the default placeholder.

1. Partners → your app → **Configuration** → **URLs**
2. Set **App URL** to your deployed URL, e.g. `https://ebay-profit-tracker-peach.vercel.app`
3. Add the same URL under **Allowed redirection URL(s)**
4. Save and reload the app in Shopify admin

Optional: set `NEXT_PUBLIC_APP_URL` in Vercel so Settings shows the exact URL to paste.

If sign-in fails inside the Shopify iframe, use **Open in new tab** (banner at the top) or disable **Embed app in Shopify admin** in Partners.
