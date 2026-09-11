# LSD Finder

Assigned portal users and administrators can search Alberta ATS locations and retain personal saved pins. The boundary and approximate pin come from the Government of Alberta ATS v4.1 map service, never AI. UWI event/sequence components are discarded only for grid lookup; the result is not a surface-well lookup.

Server callables own all database access. Saved locations live under `users/{uid}/lsdLocations`; geometry is cached under `lsdGridCache` by canonical LSD and dataset version. Boundary rings are stored as JSON strings because Firestore does not support nested arrays. Successful repeat searches update one canonical document. Lists use document-ID pages of 100.

Invalid input can use one GPT-5.4 correction request, capped at 700 output tokens and 20 requests per user per hour. Same-input suggestions are reused for 24 hours; concurrent requests share a short pending lease. Suggestions are verified against the grid and require selection. No map-service failures or explicitly unsupported provinces invoke AI. The `LSD_FINDER_MODEL` server environment variable can override the correction model.

The default basemap uses OpenStreetMap standard tiles, requested directly by the browser with visible attribution and normal HTTP caching. No bulk prefetch or offline download is provided. Respect https://operations.osmfoundation.org/policies/tiles/ . Hosting build variables `VITE_LSD_TILE_URL` and `VITE_LSD_TILE_ATTRIBUTION` can be configured as GitHub repository variables to change provider; set both together with the provider's required attribution. No Google Maps API key is needed.

Run the focused frontend test and `functions/test/lsd-finder.test.js`; the latter includes emulator-only access/isolation tests. Deploy through production GitHub Actions only. Portal access configuration changes require affected enterprise functions to deploy before Hosting.
