# Context Resume - Mundial 2026 Predictions Portal

## ESTADO ACTUAL (Junio 10, 2026)

### Desplegado en AWS (NUEVO - recreado)
- CloudFront: https://d177g7w9z1lqwo.cloudfront.net
- CloudFront ID: E3SGLHJ06VTACJ
- API: https://tzwlaeemn7.execute-api.us-east-1.amazonaws.com/prod/
- Cognito Pool: us-east-1_Z6Vc28BCK
- Cognito Client: 1idbjgbrgtu80carbn86dqq30a
- Cognito Domain: a2c-mundialito-2026.auth.us-east-1.amazoncognito.com
- DynamoDB: MundialPredictions
- S3: mundial-predictions-spa-816069124226

### Login con Microsoft - FUNCIONA
- Azure App: 18fd8dbe-58c3-4321-b42c-f6dc6261433d
- Tenant: f13dcba4-9df9-494d-8d59-772bd862df0a
- Pre-Sign-Up Lambda: ARREGLADO (permite usuarios federados con PreSignUp_ExternalProvider)
- User Pool: email MUTABLE ahora (no volverá a dar el error de attribute cannot be updated)
- PERO: después del redirect de vuelta, la app no detecta la sesión correctamente
- El auth-context usa fetchAuthSession + Hub listener pero no funciona bien con OAuth redirect

### PROBLEMA PENDIENTE: OAuth session detection
- Cognito redirige con ?code= a la raíz
- React Router redirige a /login antes de que se procese el code
- Necesito: procesar el code ANTES del router redirect, o cambiar la redirect URI a /login

### CORS/502 en nuestro API - ARREGLADO parcialmente
- Lambda entry points creados (lambda-entries/*.ts)
- Compilado a CommonJS
- Test directo de Lambda funciona (devuelve 200 con CORS headers)
- PERO: el Cognito Authorizer en API Gateway rechaza requests sin token válido → 502 sin CORS

### NUEVO: Usar worldcup26.ir como fuente de datos
- API pública: https://worldcup26.ir
- GET /get/games → 104 partidos (funciona SIN autenticación)
- GET /get/teams → 48 equipos
- GET /get/groups → 12 grupos
- GET /get/stadiums → 16 estadios
- Formato de response analizado (ver datos arriba)
- El usuario quiere cambiar el frontend para consumir esta API directamente

### PRÓXIMOS PASOS:
1. Cambiar el frontend API client para usar https://worldcup26.ir en vez de nuestro API Gateway
2. Arreglar el OAuth session detection (procesar ?code= correctamente)
3. Build + deploy a S3/CloudFront

### Deploy commands:
```bash
# Build frontend
cd packages/frontend
npx vite build

# Deploy to S3
aws s3 sync dist/ s3://mundial-predictions-spa-816069124226/ --delete

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id E3SGLHJ06VTACJ --paths "/*"
```
