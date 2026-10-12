insert into public.ebay_description_template (id, html, updated_at)
values (
  'default',
  $tpl$<style>
#ebay-description, #ebay-description * { box-sizing: border-box; }
#ebay-description { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1f2937; line-height: 1.6; background: #f9fafb; padding: 16px 0; font-size: 16px; }
#ebay-description a { color: #c2410c; text-decoration: none; }
#ebay-description .container { width: 100%; max-width: 1100px; margin: 0 auto; padding: 8px 16px; }
#ebay-description .block { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 20px; padding: 24px; margin-bottom: 16px; }
#ebay-description .brand { background: #111111; border-radius: 20px; border-top: 4px solid #F47A12; padding: 28px 16px 22px; text-align: center; }
#ebay-description .brand .logo { max-width: 280px; width: 100%; height: auto; display: block; margin: 0 auto 8px; }
#ebay-description .brand p { margin: 0 0 14px; color: #d9d9d9; }
#ebay-description h2 { font-size: 28px; line-height: 1.25; font-weight: 700; margin: 0 0 16px; color: #111827; }
#ebay-description .row { display: flex; flex-wrap: wrap; margin-left: -12px; margin-right: -12px; }
#ebay-description .span5, #ebay-description .span7, #ebay-description .span4 { padding-left: 12px; padding-right: 12px; min-width: 0; }
#ebay-description .span5 { flex: 0 0 41.666%; max-width: 41.666%; }
#ebay-description .span7 { flex: 0 0 58.333%; max-width: 58.333%; }
#ebay-description .span4 { flex: 0 0 33.333%; max-width: 33.333%; margin-bottom: 12px; }
#ebay-description .photo { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 16px; padding: 12px; }
#ebay-description .photo img { width: 100%; max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 12px; }
#ebay-description .btn { display: inline-block; margin: 4px; padding: 12px 18px; border-radius: 12px; font-weight: 700; font-size: 15px; text-decoration: none; }
#ebay-description .btn-primary { background: #F47A12; color: #111111; }
#ebay-description .btn-ghost { background: transparent; color: #F47A12; border: 1px solid #F47A12; }
#ebay-description .note { background: #f8fafc; border: 1px solid #e5e7eb; border-left: 4px solid #F47A12; border-radius: 12px; padding: 14px 16px; }
#ebay-description .note strong { display: block; margin-bottom: 4px; color: #111827; }
#ebay-description #footer { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; }
#ebay-description #footer .logo { max-width: 180px; width: 100%; height: auto; }
#ebay-description .muted { color: #6b7280; font-size: 14px; margin: 0; }
@media (max-width: 768px) {
  #ebay-description .span5, #ebay-description .span7, #ebay-description .span4 { flex: 0 0 100%; max-width: 100%; }
  #ebay-description h2 { font-size: 22px; }
  #ebay-description .block { padding: 16px; border-radius: 14px; }
  #ebay-description #footer { justify-content: center; text-align: center; }
}
</style>
<div id="ebay-description">
  <div class="container">
    <div class="brand">
      <img class="logo" src="https://tstrade.co.uk/cdn/shop/t/3/assets/tstrade-logo.png?v=13904708887491951791788393307" alt="TS Trade" />
      <p>Tools and fixings for trade professionals</p>
      <a class="btn btn-ghost" href="https://tstrade.co.uk/pages/contact">Contact us</a>
      <a class="btn btn-primary" href="https://tstrade.co.uk/collections/all">Shop</a>
    </div>
  </div>
  <div class="container">
    <div class="block">
      <h2>{{title}}</h2>
      <div class="row">
        <div class="span5"><div class="photo">{{image}}</div></div>
        <div class="span7"><div style="overflow-wrap:anywhere;"><!--ts-body-start-->{{body}}<!--ts-body-end--></div></div>
      </div>
    </div>
  </div>
  <div class="container">
    <div class="block">
      <div class="row">
        <div class="span4"><div class="note"><strong>Trade quality</strong>Products chosen for site and workshop use.</div></div>
        <div class="span4"><div class="note"><strong>UK dispatch</strong>Sent from our UK warehouse.</div></div>
        <div class="span4"><div class="note"><strong>Before you buy</strong>Check the size, quantity, and finish.</div></div>
      </div>
    </div>
  </div>
  <div class="container">
    <div class="block" id="footer">
      <img class="logo" src="https://tstrade.co.uk/cdn/shop/t/3/assets/tstrade-logo.png?v=13904708887491951791788393307" alt="TS Trade" />
      <p class="muted">Dispatched from the UK. The same stock is on tstrade.co.uk.</p>
      <div>
        <a class="btn btn-primary" href="https://tstrade.co.uk/collections/all">Shop</a>
        <a class="btn btn-ghost" href="https://tstrade.co.uk/pages/contact">Contact us</a>
      </div>
    </div>
  </div>
</div>$tpl$,
  now()
)
on conflict (id) do update
set html = excluded.html,
    updated_at = now();
