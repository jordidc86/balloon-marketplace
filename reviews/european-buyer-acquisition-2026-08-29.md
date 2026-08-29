# AeroTrade European buyer acquisition candidate — 2026-08-29

Status: implemented and locally verified; not deployed; no search or conversion result claimed.

## Evidence-based opportunity

- Production has 12 public listings from 5 sellers but no comparable post-instrumentation buyer visit, enquiry or new-balloon request.
- English search already exposes AeroTrade, while German has specialist used-equipment competition and French/Spanish results are easily polluted by decorative or toy balloons. The candidate therefore differentiates genuine balloon-industry inventory without claiming certification or airworthiness.
- The implementation does not create a new catalogue, analytics table or lead process. It reuses current public inventory, the existing wanted-request flow, the existing Pasha/Schroeder request flow and the existing first-external-source attribution stored for later catalogue conversion. A closed `entry_context` extends the existing catalogue-demand ledger so localized entry can be measured without URL, query text, raw visitor identifier or personal data.

## Public entries in the candidate

1. `/used-hot-air-balloons-for-sale`
2. `/de/gebrauchte-heissluftballons`
3. `/fr/montgolfieres-occasion`
4. `/es/globos-aerostaticos-segunda-mano`

Every entry has a self-canonical URL, reciprocal `hreflang` alternatives with `x-default`, current public inventory, a truthful verification boundary and three commercial exits: catalogue, wanted request and new-balloon estimate.

## Local verification

- 161/161 automated tests in the grouped candidate.
- 165/165 operational contracts in the grouped candidate.
- ESLint and TypeScript pass.
- Full Next.js production build passes and exposes all four dynamic routes.
- Local Netlify-runtime check returned HTTP 200 for all four pages, six real public listing links on each page and HTTP 200 for the sitemap containing all four URLs.
- Mobile check at 390 × 844 showed no horizontal overflow (`scrollWidth = clientWidth = 390`), a visible catalogue action and current inventory count.
- Control Tower keeps localized entry visits, later listing openings and high-intent journeys separate from actual catalogue searches and zero-result demand.

## Proof gate after release

Implementation does not increase commercial proof. Measure only genuine evidence:

- search impressions/clicks by landing path once a Search Console property exists;
- comparable listing visits retaining an external source;
- wanted requests, marketplace enquiries or new-balloon requests downstream of those journeys;
- no invented search, lead, revenue or airworthiness evidence.

No production migration, message, external submission, Netlify preview or Netlify deploy was created while implementing or verifying this candidate.
