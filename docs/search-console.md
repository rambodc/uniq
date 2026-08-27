# Search Console launch checklist

The canonical public origin is `https://www.uniqenergy.com`. No analytics script is installed.

1. Verify a Google Search Console **Domain property** for `uniqenergy.com` with Google's DNS record.
2. If HTML-token verification is also needed, set `GOOGLE_SITE_VERIFICATION` in the production GitHub Actions environment. Bing uses `BING_SITE_VERIFICATION`; neither token belongs in this repository.
3. Submit `https://www.uniqenergy.com/sitemap.xml` and confirm that all 20 URLs are discovered.
4. Inspect `/`, `/drilling-fluid-systems`, two product pages, `/locations`, and `/contact-us`, then request indexing after release.
5. Review Page indexing, Enhancements, Core Web Vitals, queries, impressions, clicks, click-through rate, and average position weekly for eight weeks.
6. If two pages receive the same queries, clarify their headings and internal links instead of creating near-duplicate pages.
7. Revalidate Product, Breadcrumb, Organization, and FAQ structured data after material content changes.

Publish only through the protected `production` branch and monitor the GitHub Actions deployment. Never deploy Firebase from a local shell.
