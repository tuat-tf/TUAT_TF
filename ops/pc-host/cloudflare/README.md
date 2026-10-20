# PC app Cloudflare VPC entry

The PC app now uses a fixed Cloudflare public entry. See the latest notes in
[PC production handoff](../../laptop/PC-PRODUCTION-HANDOFF.md) for the accepted
deployment, verification, and remaining checks. This folder describes the source
and configuration contract. Checked-in templates still contain placeholders;
their presence does not provision a resource or prove a deployed version.

The path is a fixed HTTPS
`<worker>.<account-subdomain>.workers.dev` address, one Worker `PC_APP` VPC Service
binding, a persistent named Cloudflare Tunnel, and this PC's loopback app gateway.
Next, Auth, REST and private images run on the PC. Encrypted offsite backup uses
R2 through its separate backup owner; R2 is not the current image data path.
Keep the retired cloud source fences and writers disabled. No Quick Tunnel,
endpoint lease/discovery, fallback, retry, or
second data path is involved.

## Acceptance contract

`APP_PUBLIC_ORIGIN` must be the same exact HTTPS origin in the Worker, PC gateway,
and Next runtime. Other public Worker aliases are rejected. Modifying requests
require that exact `Origin`; authentication and application authorization remain
the app's responsibility. Request method, path, query, application headers,
cookies and body reach the one binding. Proxy/internal and hop headers are
removed. The upstream Response passes through unchanged, retaining streaming,
separate `Set-Cookie` values and browser-visible redirects. Each request has at
most one dispatch. A transport exception returns a generic, uncached 503; a write
whose result is unknown is never resent. A response stream interrupted after
headers has been returned fails to the client rather than starting another fetch.

The VPC Service must be configured as **HTTP**, pinned to the intended named
Tunnel ID and **127.0.0.1 plus the dedicated gateway port**, with only `http_port`
enabled. Do not point it at Next directly, a DB, Studio, Auth/admin API or another
network service. The Worker uses an `http://<fixed-public-host>/...` fetch URL:
Cloudflare routes to the destination configured in the VPC Service; the URL host
supplies HTTP `Host`. Traffic is encrypted through the Tunnel and plaintext only
between the connector and the gateway on the same PC. A change to this route
requires proof through the actual deployed route, in addition to local tests.

## Local checks

From the repository root, using an isolated development Node runtime:

```powershell
node --test ops/pc-host/cloudflare/worker.test.mjs ops/pc-host/cloudflare/config.test.mjs
node ops/pc-host/cloudflare/check-config.mjs
```

The second command intentionally exits 1 while the checked-in template contains
placeholders. It performs no network/provider operation. The tests use only fake
bindings and synthetic requests, responses, streams and IDs; they do not load
credentials or verify Cloudflare itself.

For later authorized configuration, make an ignored `wrangler.local.json` beside
the template. Fill exactly three placeholders: fixed Worker `name`, the complete
`https://<name>.<account-subdomain>.workers.dev` `APP_PUBLIC_ORIGIN`, and the VPC
Service UUID. Keep the one `PC_APP` binding, `remote: true`, and `workers_dev: true`.
Then run:

```powershell
node ops/pc-host/cloudflare/check-config.mjs ops/pc-host/cloudflare/wrangler.local.json
```

Passing this check proves local configuration shape only. It does not verify the
bound service's actual destination, account access, quota, connector, or routing.
No deployment command is part of these local checks.

## Static assets without Worker invocations

The unpublished `wrangler.assets.example.json` adds asset-first delivery on the
same origin. Existing JS/CSS/fonts under `/_next/static/` and an explicit list of
public branding files can be served by Cloudflare without invoking this Worker.
HTML, RSC, Auth, API, private images, service worker and missing files still go
through the existing single PC dispatch. This is source preparation, not an
account setting or an active deployment.

Use `prepare-assets.mjs` only with an independently prepared PC release:

```powershell
node ops/pc-host/cloudflare/prepare-assets.mjs --prepare HOST_CONFIG NEW_BUNDLE_DIRECTORY PREVIOUS_BUNDLE_DIRECTORY
node ops/pc-host/cloudflare/prepare-assets.mjs --verify NEW_BUNDLE_DIRECTORY
```

Omit the previous bundle only on the first release. The command reads the
existing host configuration, verifies its prepared receipt, source commit,
runtime manifest and build hash, and checks Next's deployment ID. It neither
builds nor starts the app, changes the configuration, contacts Cloudflare, nor
reads user images. The output's parent must exist and its destination must be
new. An existing bundle is never overwritten or removed.

The new bundle contains `assets/` and a sibling `manifest.json`. Only `assets/`
is uploaded. It contains `.next/static` with source maps excluded, the named
branding files, and generated cache headers. Unknown extensions, links,
unlisted files, changed bytes and immutable URL collisions fail verification.
Never replace this directory with `.next`, `public`, a release root or image
storage. Server output, secrets, user images, receipt and private responses
must remain outside it.

Keep all previous active releases' Next assets by supplying their verified
bundles; a previously accumulated bundle already includes its predecessors.
The manifest records each release and every file hash. Unhashed branding comes
from the selected release. For rollback, prepare the older verified release
with the newest bundle as a previous bundle, so newer open tabs do not lose
their asset URLs. A URL collision must be resolved before publishing. Do not
delete old hashes on a timer without establishing that no active release/tab
requires them. These assets do not make old application APIs interchangeable.

For a later authorized deployment, use the new template with the existing
Worker name, origin and VPC binding. In that release's Cloudflare directory,
the verified bundle is `.contingency/static-assets/`. `check-config.mjs` now
verifies its manifest as well as the configuration. It requires
`run_worker_first: false`, `html_handling: "none"` and
`not_found_handling: "none"`; SPA fallbacks and extra assets bindings are
rejected. The Worker source is unchanged. Existing static assets are public,
so they do not pass the Worker's hostname/auth checks; private requests still
do. Preserve the current origin and authorization rules.

Local asset tests use isolated fixtures and a model of Cloudflare routing:
known GET/HEAD assets cause zero Worker/PC dispatches; dynamic paths and writes
retain one dispatch, and missing static assets retain their 404. This is not a
measurement of the deployed account. Before publishing, confirm the actual
route, MIME/cache headers, first/repeat visits, auth cookies, RSC, writes,
private-image denial, missing hashes, old tabs and rollback, and compare
account-wide request counts. Build/package/PC release and assets must refer to
the same commit. No automatic deployment or quota guarantee is provided.
When publication is authorized, make the union of old and new assets available
before switching the PC to the new release. After switching, check both the PC
version and bundle receipt against that release. Roll back the PC with the
union still available; do not replace it with a bundle that drops newer hashes.

Official behavior checked on 2026-10-20:
[asset-first matching](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/),
[static request billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
[disabling HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/),
and [asset response headers](https://developers.cloudflare.com/workers/static-assets/headers/).
The reduced count comes from avoiding Worker execution; caching inside the
Worker alone would not remove its invocation.

## Checks for route changes

Before an authorized route change, verify the intended account's VPC access/roles and fixed hostname;
verify the service is pinned to this gateway; install the named connector under
the intended runtime policy; prove the route under normal and unavailable-PC
conditions. Recheck the provider's connector version and transport requirements
before changing its configuration. Verify connector restart and network
changes as well as Next pages/assets, RSC streaming, Server Actions, login and
Google callback cookies/redirects, CSRF rejection, private images/uploads,
multiple cookies, and an interrupted write with no replay. Update Auth redirect
allowlists only within the separately authorized cutover scope. A synthetic
transport test cannot establish these checks or actual user/device behavior.

## Historical provider check (2026-10-11)

The preparation review recorded Workers VPC as open beta and free on all Workers
plans during beta, with ordinary Workers quotas still applying. It recorded
100,000 inbound requests per day/account and 10 ms CPU per request for Workers
Free, and a connector requirement of `cloudflared` 2025.7.0 or newer with
QUIC (`auto`/`quic`) over outbound UDP 7844. These are dated research notes,
not assertions of today's pricing, limits, or requirements.

Requests proxied from the PC include its PC-served assets. The preparation review
also recorded Cloudflare's recommendation to use a custom domain for production
and its description of `workers.dev` as intended for personal/hobby, noncritical
projects. Recheck the primary sources before a new capacity, cost, or deployment
decision; this document does not promise perpetual free pricing.

Primary sources:

- [VPC setup and all-plan beta availability](https://developers.cloudflare.com/workers-vpc/get-started/)
- [Official private website example using workers.dev](https://developers.cloudflare.com/workers-vpc/examples/private-api/)
- [VPC destination and Host behavior](https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/)
- [Named Tunnel, no public ingress requirement, QUIC/version prerequisites](https://developers.cloudflare.com/workers-vpc/configuration/tunnel/)
- [VPC beta pricing](https://developers.cloudflare.com/workers-vpc/platform/pricing/)
- [workers.dev hostname and intended use](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Request/manual redirect behavior](https://developers.cloudflare.com/workers/runtime-apis/request/)
