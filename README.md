# Molko

MVP de Molko: editor web de video "brainrot" (clip fuente arriba + gameplay de fondo abajo, subtítulos automáticos con resaltado de palabra activa, formato vertical 9:16). Ver `docs/Molko_Documento_Maestro.docx` para la especificación completa de producto.

**Alcance de este MVP (Fase 1 del roadmap):** modo Brainrot con video propio subido por el usuario, subtítulos automáticos con fuente predefinida, y suscripción de pago (Stripe). El descargador de YouTube, el Modo Historias y el divisor de video largo son de fases posteriores y no están implementados.

## Arquitectura

- **Frontend:** React + Vite. Todo el procesamiento de video (overlay, quemado de subtítulos, export) corre en el navegador con `@ffmpeg/ffmpeg` (ffmpeg.wasm) — el backend nunca recibe ni almacena los videos del usuario.
- **Backend:** Python + FastAPI. Solo maneja autenticación, suscripciones (Stripe) y un proxy de transcripción hacia Deepgram (para no exponer la API key en el cliente).
- **Base de datos:** SQLite vía SQLAlchemy — un solo archivo, sin servicio externo que operar para un MVP.
- **Transcripción:** [Deepgram](https://deepgram.com) (modelo `nova-2`), devuelve timestamps por palabra que alimentan el resaltado de palabra activa en los subtítulos.
- **Pagos:** Stripe Checkout (suscripción mensual/anual) + Billing Portal para autogestión.

## Requisitos

- Python 3.12+
- Node.js 20+
- Una cuenta de [Stripe](https://dashboard.stripe.com/test/apikeys) en modo test (para pagos)
- Una API key de [Deepgram](https://console.deepgram.com) (para subtítulos)

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edita `backend/.env` con tus llaves de Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`) y tu `DEEPGRAM_API_KEY`. Necesitas crear en Stripe dos "Prices" recurrentes (uno mensual $5 USD, uno anual $50 USD) y copiar sus IDs.

```bash
uvicorn app.main:app --reload --port 8000
```

La API queda en `http://localhost:8000` (docs interactivas en `/docs`). Las tablas de SQLite se crean automáticamente al arrancar.

Para probar los webhooks de Stripe en local, usa el Stripe CLI:

```bash
stripe listen --forward-to localhost:8000/billing/webhook
```

## Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

La app queda en `http://localhost:5173`. `npm install` copia automáticamente el core de ffmpeg.wasm a `public/ffmpeg/` (se regenera en cada instalación, no está en git por su tamaño).

## Fuente de subtítulos

Los subtítulos usan DejaVu Sans Bold (`frontend/public/fonts/`), una fuente de licencia libre (Bitstream Vera / DejaVu, ver `LICENSE.txt` junto al archivo) — es la única fuente del MVP, sin personalización.

## Gameplay de fondo

En este MVP el usuario sube **ambos** videos (clip fuente y gameplay de fondo) desde el editor — no hay una librería de gameplays predefinida ni descarga de contenido de terceros.

## Límites de memoria del navegador

Como el procesamiento corre 100% en el cliente, el editor rechaza archivos de más de 300MB cada uno (o 450MB combinados) con un mensaje claro, para evitar que la pestaña del navegador se quede sin memoria a mitad de un export.
