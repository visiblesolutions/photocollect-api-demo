# Photo Collect API Demo

This is a demo for the Photo Collect flow:

1. Choose Deeplink, Deeplink iFrame, or API on the start screen.
2. Generate either a signed deeplink, an embedded deeplink, or a `POST /invitation` invitation URL.
3. Poll `GET /export` and show the latest photo for the provided `customer_no`.

## Configuration

Runtime settings are stored in config/app.ini. Take the structure from config/app.ini.example.

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

1. Build frontend assets before deploy: `npm install && npm run build:css`
2. Deploy app/runtime files only: `public/`, `src/`, `templates/`, `config/`, `vendor/`, `composer.*`
3. Do not deploy `node_modules/` (build-time only)
4. Ensure your web server document root points to `public/`
5. Ensure production `config/app.ini` exists with valid API credentials


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
