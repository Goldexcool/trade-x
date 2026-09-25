import { Router } from 'express'
import { openapi } from './openapi.ts'

const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5'

export const docsRouter = Router()

docsRouter.get('/openapi.json', (_req, res) => { res.json(openapi) })

docsRouter.get('/docs', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Trade-X API</title>
  <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css">
  <style>body { margin: 0; } .swagger-ui .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger"></div>
  <script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
  <script>
    SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger', persistAuthorization: true, tryItOutEnabled: true, displayRequestDuration: true })
  </script>
</body>
</html>`)
})
