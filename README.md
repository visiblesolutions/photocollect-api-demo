# Photo Collect API Demo

This is a demo for the Photo Collect flow:

1. Configure the flow toggles, checks, optional background color, locale, and launch mode on the start screen.
2. Open either a generated signed deeplink, an embedded deeplink, or a `POST /invitation` invitation URL for the fixed `api-demo` site code.
3. Poll `GET /export` and show the latest photo for the provided `customer_no`.

## Configuration

Runtime settings are stored in config/app.ini. Take the structure from config/app.ini.example.
Use a single `site_code` entry there; the app no longer supports a list of site codes.

## Install

Use a php web server.

Point your web server document root at the `public/` directory so only browser-facing files are exposed:

The Slim front controller is public/index.php, and browser assets stay under public/assets.


## Frontend build

The frontend styles are generated with Tailwind CLI:

1. Install dependencies: `npm install`
2. Build CSS once: `npm run build:css`

`public/assets/styles.css` is the compiled production stylesheet linked by the app.

The browser JavaScript is organized as native ES modules under `public/assets/app/` and loaded directly by the template. No JavaScript bundler is required for runtime deployment.


## Deploy checklist

1. Build frontend assets before deploy: `npm ci && npm run build:css`
2. Deploy app/runtime files only: `public/`, `src/`, `templates/`, `config/`, `vendor/`, `composer.*`
3. Do not deploy `node_modules/` (build-time only)
4. Ensure your web server document root points to `public/`
5. Ensure production `config/app.ini` exists with valid API credentials

### Automatic deployment with GitHub Actions

The workflow in `.github/workflows/workflow.yml` deploys pushes to `main` over SFTP.
You can also run **Deploy Photo Collect API Demo** manually from the Actions tab, selecting `main`.

Configure these repository settings under **Settings → Secrets and variables → Actions**:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `SFTP_HOST` | SFTP server hostname |
| Secret | `SFTP_USER` | SFTP username |
| Secret | `SFTP_PASSWORD` | SFTP password |
| Variable | `SFTP_REMOTE_PATH` | Absolute application directory for `apidemo.photocollect.io`, containing `public/`, `src/`, and `config/` |

The server must support SFTP on port 22 and PHP 8.3 or newer. Set the site's document root to
`<SFTP_REMOTE_PATH>/public` and create `<SFTP_REMOTE_PATH>/config/app.ini` from
`config/app.ini.example` with production credentials before the first deployment.

The workflow builds CSS with Node.js 22, installs production Composer dependencies with PHP 8.3,
and uploads `public/`, `src/`, `templates/`, `vendor/`, `composer.json`, `composer.lock`, and
`config/app.ini.example`. Full synchronization uploads files without deleting remote files, preserving
the server's `config/app.ini`. Remove obsolete application files from the server manually when needed.
After uploading, the workflow downloads the deployment action's `.deploy-revision` marker and checks
that it matches the deployed Git commit.


## Live Demo

Try it here: [Live demo](https://apidemo.photocollect.io).


## API documentation

Refer to the [API documentation](https://apidoc.photocollect.io).

## Deeplink iFrame child -> parent messages

In the `deeplink-iframe` flow, the parent page listens to `window.postMessage` events from the embedded deeplink iFrame.

Supported child -> parent message types:

1. `photo-collect:process-step`
   - Purpose: report the current process step in the iFrame flow.
   - Payload:
     ```json
     {
       "type": "photo-collect:process-step",
       "value": "finalize"
     }
     ```
   - Parent behavior:
     - Updates the process-step status panel.
     - If `value === "finalize"` in `deeplink-iframe` flow, the flow is finished and the photo can be downloaded.

2. `photo-collect:content-resize`
   - Purpose: tell the parent to resize the iFrame height.
   - Payload:
     ```json
     {
       "type": "photo-collect:content-resize",
       "height": 980
     }
     ```
   - Parent behavior:
     - Applies the provided `height` to the embedded iFrame.

3. `photo-collect:activity`
   - Purpose: report user activity inside the deeplink iFrame to the parent window.
   - Supported event values:
     - `click`
     - `focus`
     - `keyup`
   - Payload:
     ```json
     {
       "type": "photo-collect:activity",
       "value": "click"
     }
     ```
   - Parent behavior:
     - Appends the activity event to the iFrame activity log in the demo UI.
