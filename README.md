# Molko

MVP de Molko: editor web de video "brainrot" (clip fuente arriba + gameplay de fondo abajo, formato vertical 9:16). Ver `docs/Molko_Documento_Maestro.docx` para la especificación completa de producto.

**Alcance de este MVP (Fase 1 del roadmap):** modo Brainrot con video propio subido por el usuario (o descargado de YouTube), y cuentas de usuario con suscripción de pago (Stripe). Subtítulos automáticos, Modo Historias y divisor de video largo quedan para fases posteriores y no están activos por ahora (ver [Subtítulos automáticos](#subtítulos-automáticos-función-futura)).

## Arquitectura

- **Frontend:** React + Vite. Todo el procesamiento de video (overlay, export) corre en el navegador con `@ffmpeg/ffmpeg` (ffmpeg.wasm) — el backend nunca recibe ni almacena los videos que el usuario sube directamente.
- **Backend:** Python + FastAPI. Conversión de clips AV1/VP9 con `ffmpeg` y el descargador de YouTube con `yt-dlp`. Cuentas, suscripciones y lista de espera viven en una base SQLite (SQLAlchemy); ver [Cuentas y suscripción](#cuentas-y-suscripción).

## Requisitos

- Python 3.12+
- Node.js 20+
- `ffmpeg` instalado y en el `PATH` (lo usa el backend para convertir clips AV1/VP9 a H.264)
- `yt-dlp` instalado y en el `PATH` (lo usa el backend para el descargador de YouTube)

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edita `backend/.env` con un `JWT_SECRET` propio (`python -c "import secrets; print(secrets.token_urlsafe(48))"`). Si `JWT_SECRET` queda con el valor por defecto, el backend lo avisa al arrancar.

```bash
uvicorn app.main:app --reload --port 8000
```

La API queda en `http://localhost:8000` (docs interactivas en `/docs`). Las tablas se crean solas al arrancar (`molko.db`, ignorado por git). Para levantar backend y frontend juntos: `scripts/dev-up.sh` / `scripts/dev-down.sh`.

Pruebas del backend: `pip install -r requirements-dev.txt && python -m pytest`.

## Cuentas y suscripción

Todo el editor está detrás de login y de una suscripción activa ($5 USD/mes o $50 USD/año). El backend exige ambas cosas en `/transcode` y `/youtube`; el frontend muestra login → planes → app.

**Registrarse es comprar:** en `/register` la persona llena sus datos, elige plan (mensual o anual; `?plan=annual` lo preselecciona, y la landing lo manda así) y acepta los términos. El botón "Registrarme y pagar" crea la cuenta y abre de inmediato Stripe Checkout con ese plan. La cuenta existe desde ese momento, pero el editor solo se abre cuando el webhook de Stripe confirma el pago. Si la persona cancela en Stripe vuelve con su sesión abierta a `/pricing`; si Stripe falla al abrirse, la cuenta queda creada y llega a `/pricing` con un aviso para reintentar. Con Google se entra y se pasa a `/pricing` para elegir plan. Las cuentas que nunca pagan cuentan para `MAX_USERS`.

- **Sesión:** JWT en `Authorization: Bearer` (guardado en `localStorage`), contraseñas con bcrypt, límite de intentos en login/registro.
- **Cobro:** Stripe Checkout + portal de facturación (ver [Configurar Stripe](#configurar-stripe)).
- **Acceso sin cobro (fundador / pruebas):** `cd backend && .venv/bin/python -m scripts.seed_trial_user tu@correo.com [contraseña] [días]` crea la cuenta con suscripción activa otorgada a mano. Sin contraseña genera una y la imprime una vez.
- **Lanzamiento controlado:** `MAX_USERS=50` cierra el registro al llegar a 50 cuentas y la pantalla de registro pasa a ser una lista de espera. Los correos se ven con `.venv/bin/python -m scripts.list_waitlist`; para dar cupo, sube `MAX_USERS`.
- **Descargador de YouTube:** `YOUTUBE_ENABLED=false` lo apaga al instante; `YOUTUBE_MONTHLY_LIMIT` (20) y `YOUTUBE_MAX_DURATION_SECONDS` (1800) lo limitan por usuario. Una descarga que falla no gasta cupo.

Pendiente: recuperación de contraseña (Molko ya no envía correos, así que haría falta volver a montar un servidor de correo; con Google no se necesita) y migraciones de base de datos (hoy `create_all` más `ensure_sqlite_columns` para SQLite; con otro motor o cambios más grandes hará falta Alembic). Al desplegar detrás de un proxy, arranca uvicorn con `--proxy-headers` para que el límite de intentos use la IP real.

## Configurar Stripe

El código de cobro ya está hecho; falta conectar tu cuenta de Stripe. En `backend/.env`:

| Variable | De dónde sale |
| --- | --- |
| `STRIPE_SECRET_KEY` | Dashboard → Developers → API keys → *Secret key* (`sk_test_…` en modo prueba, `sk_live_…` en producción). Solo va en el `.env` del backend. |
| `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL` | Los `price_…` de los planes de $5 USD/mes y $50 USD/año. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` del webhook (abajo). |

Sin ellas, "Registrarme y pagar" responde que los pagos no están configurados. Reinicia el backend al cambiar el `.env` (`scripts/dev-down.sh && scripts/dev-up.sh`).

**Crear producto y precios con el CLI de Stripe** (`stripe login` una vez; añade `--live` para producción):

```bash
stripe products create --name="Molko"
stripe prices create --product=<prod_…> --unit-amount=500  --currency=usd -d "recurring[interval]=month" --lookup-key=molko_monthly
stripe prices create --product=<prod_…> --unit-amount=5000 --currency=usd -d "recurring[interval]=year"  --lookup-key=molko_annual
```

Copia los `price_…` resultantes al `.env`. También hace falta una configuración del **portal de facturación** (Dashboard → Settings → Billing → Customer portal, o `stripe billing_portal configurations create …`): sin ella "Administrar suscripción" falla.

**Webhook (es lo que da acceso tras pagar):**
- Local: deja corriendo `stripe listen --forward-to localhost:8000/billing/webhook`; `stripe listen --print-secret` imprime el `whsec_…` para `STRIPE_WEBHOOK_SECRET`.
- Producción: crea un endpoint `https://<tu-backend>/billing/webhook` con los eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` y `customer.subscription.deleted`, y usa el secreto de ese endpoint.

**Probar un pago:** en modo prueba usa la tarjeta `4242 4242 4242 4242` (cualquier fecha futura y CVC). Al pagar, Stripe regresa a `/app?checkout=success` y la app espera unos segundos al webhook antes de abrir el editor.

**Reglas de acceso:** solo `active` y `trialing` abren el editor. Si un cobro falla (`past_due`) se pierde el acceso y la persona no puede crear otra suscripción (evita cobrarle dos veces): debe arreglar su método de pago desde el menú de su cuenta (portal). Al cancelar desde el portal, el acceso sigue hasta el fin del periodo pagado.

## Rutas y páginas

| Ruta | Quién entra | Qué es |
| --- | --- | --- |
| `/` | todos | Landing: cómo funciona, funciones, precios, preguntas frecuentes |
| `/terms` | todos | Términos y condiciones (español e inglés) |
| `/auth/google/done` | todos | Regreso de Google: canjea el código de un solo uso por la sesión |
| `/login`, `/register` | solo visitantes | Con sesión redirigen a `/app` (o a `/pricing` si no hay suscripción) |
| `/pricing` | con sesión | Planes; con suscripción activa redirige a `/app` |
| `/app/editor`, `/app/download` | con sesión y suscripción | El editor y el descargador; `/app` lleva al editor |
| cualquier otra | todos | Página 404 |

Quien intenta entrar a una ruta protegida va a `/login` y, tras entrar, regresa a donde iba. Stripe regresa a `/app?checkout=success` (o `/pricing?checkout=cancel`); si el webhook aún no llegó, `/pricing` consulta la cuenta hasta que la suscripción aparezca y entonces pasa sola a la app.

**Hosting:** como son rutas de una SPA, el servidor debe responder `index.html` para cualquier ruta que no sea un archivo (en Netlify/Cloudflare Pages un `/* /index.html 200`; en Nginx `try_files $uri /index.html`). Sin eso, abrir o recargar `/app/editor` o volver de Stripe da 404. `vite dev` y `vite preview` ya lo hacen.

## Términos y condiciones

El texto está en `frontend/src/legal/terms.ts` (español e inglés) y se ve en `/terms`. **Es un texto de partida: que un abogado lo revise antes de cobrar**, sobre todo el reembolso (hoy dice que los pagos no son reembolsables), la limitación de responsabilidad, la jurisdicción y el tratamiento de datos (puede hacer falta además un aviso de privacidad).

- **Datos del titular:** define en `frontend/.env` `VITE_LEGAL_NAME`, `VITE_CONTACT_EMAIL` y `VITE_LEGAL_JURISDICTION` (ciudad y estado). Si faltan, la página muestra marcadores entre corchetes.
- **Aceptación:** registrarse exige marcar la casilla (el backend también lo exige) y se guarda la versión y la fecha en la cuenta (`terms_version`, `terms_accepted_at`).
- **Cambiar el texto:** sube la versión en `TERMS_VERSION` (`frontend/src/legal/terms.ts`) y en `terms_version` (`backend/app/core/config.py`); una prueba avisa si difieren. A quien aceptó una versión anterior se le muestra un diálogo que debe aceptar para seguir.

## Nombre y saludos

El nombre es opcional: se pide al registrarse y se edita desde el menú de cuenta (`PATCH /auth/me`; máximo 60 caracteres, sin `<` `>` ni caracteres invisibles). Al entrar a la app aparece un saludo con el nombre, elegido al azar entre 20 frases según la hora local (mañana 5–12, tarde 12–19, tarde-noche 19–22, noche 22–5), en el idioma activo. Las frases están en `frontend/src/i18n/es.ts` y `en.ts` (`greeting.*`, todas con `, {name}`); la lógica, en `frontend/src/lib/greetings.ts`. Sin nombre, el saludo se lee natural ("Buenos días").

## Navegadores compatibles

Molko corre en los navegadores modernos de escritorio y celular: Chrome, Edge, Firefox y Safari. El mínimo lo marca Tailwind CSS 4 (aprox. Chrome/Edge 111, Firefox 128 y Safari 16.4 en Mac y iPhone); en versiones más viejas la página se ve sin estilos. El procesamiento de video usa WebAssembly, disponible en todos ellos.

**Probado** (automatizado con Playwright: registro, login, idiomas, cabecera en 390 y 320 px y exportación real de video): Chromium 153 y Firefox 155, con el core multi-hilo de ffmpeg. En WebKit 26.6 (motor de Safari) se probó todo lo anterior salvo la lectura de duración de video, porque el WebKit de Playwright para Linux no decodifica H.264; ahí se validó el ensamblado con ffmpeg.wasm por separado (salida 720×1280 correcta, con la fuente del texto "PARTE N").

**Sin probar en equipos reales:** Safari en Mac y iPhone/iPad, y Chrome en Android. Antes de lanzar, prueba una exportación de punta a punta ahí. En celulares, sobre todo iPhone, la memoria para ffmpeg.wasm es limitada: los límites de 300 MB por archivo pueden ser demasiado altos y conviene bajarlos si aparecen cierres de pestaña.

Para que se use el core multi-hilo, el hosting debe mandar los headers COOP/COEP (ver [Core multi-hilo](#core-multi-hilo-de-ffmpegwasm)); si no, cae al de un solo hilo, más lento pero funcional.

## Idiomas

Toda la página está en español e inglés y se cambia con el selector de la cabecera. El idioma inicial se decide así, en orden:

1. El que la persona eligió antes (se guarda en `localStorage`; solo se guarda la elección explícita).
2. El idioma del navegador (`navigator.languages`), si es uno de los soportados.
3. La ubicación, estimada por la zona horaria del navegador: hispanohablante → español; cualquier otra → inglés.

No se usa geolocalización por IP (haría falta un servicio externo y un aviso de privacidad); si más adelante despliegas detrás de un CDN que mande el país (p. ej. `CF-IPCountry`), se puede agregar como una señal más en `frontend/src/i18n/index.ts` (`detectLanguage`).

- **Textos:** viven en `frontend/src/i18n/es.ts` (idioma base) y `en.ts`. TypeScript marca cualquier clave que falte en `en.ts`. En componentes usa `const { t } = useI18n()`; fuera de ellos, `import { t } from "../i18n"`.
- **Agregar un idioma:** súmalo a `LANGUAGES` en `i18n/index.ts`, crea su diccionario (`Record<MessageKey, string>`) y regístralo en `dictionaries`. También agrega su zona horaria si quieres que se detecte por ubicación.
- **Errores del backend:** llegan como `{"detail": {"code", "message", "params"}}` (ver `backend/app/core/errors.py`). El frontend traduce `code` con la clave `errors.<code>` y usa `message` (en español) solo como respaldo. Al crear un error nuevo en el backend, agrega su clave `errors.<code>` en ambos diccionarios.
- Los precios se muestran en USD en ambos idiomas; la equivalencia en MXN (aproximada) solo aparece en español.

## Iniciar sesión con Google

Botón "Continuar con Google" en `/login` y `/register`. Google entrega el correo ya verificado (`email_verified`). Molko no envía correos ni pide verificar el correo: las cuentas con contraseña entran y pagan directamente. Sin `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` el botón no aparece.

**Configurarlo (una vez):**

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) crea un proyecto y una pantalla de consentimiento (mientras esté en "Prueba" agrega tu correo como usuario de prueba).
2. Crea un **ID de cliente de OAuth**, tipo **Aplicación web**. En "URI de redireccionamiento autorizados" pon `<BACKEND_URL>/auth/google/callback` (en local: `http://localhost:8000/auth/google/callback`; en producción tu dominio del backend con https).
3. En `backend/.env` pon `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `BACKEND_URL` (la misma URL base del paso 2; `FRONTEND_URL` y `CORS_ORIGINS` también deben ser los reales). El secreto **solo** va en el `.env` del backend.
4. Reinicia el backend (`scripts/dev-down.sh && scripts/dev-up.sh`, porque `--reload` no relee `.env`).

**Cómo funciona:** flujo de código de autorización con redirecciones de página completa (no el popup/iframe de Google, que choca con los encabezados COOP/COEP que necesita ffmpeg.wasm): `GET /auth/google/start` → Google → `GET /auth/google/callback` (el servidor canjea el código con el secreto) → `/auth/google/done?code=…` en el frontend → `POST /auth/google/session` devuelve la sesión. Una cuenta nueva necesita aceptar los términos (el botón lo indica) y respeta el cupo `MAX_USERS`.

**Seguridad:**
- `state` firmado y ligado a una cookie `httpOnly` del navegador que inició el flujo (evita el "login CSRF": que alguien te inicie sesión en la cuenta de otra persona) más un `nonce` dentro del ID token.
- El ID token se valida con las llaves públicas de Google: solo RS256 (sin confusión de algoritmo ni `alg: none`), `aud` = tu client id, emisor de Google, `exp`, `nonce` y `email_verified`.
- La sesión nunca viaja en la URL: el servidor regresa con un código de un solo uso que dura 60 s y se canjea por el token.
- Defensa contra "pre-hijacking": como el registro con contraseña no verifica el correo, alguien pudo registrar el correo de otra persona y luego esa persona entra con Google, la contraseña se invalida y se cierran las sesiones existentes de esa cuenta.
- Una cuenta se liga por el identificador estable de Google (`sub`), no por el correo; un mismo correo con otra cuenta de Google se rechaza.
- Las cuentas creadas solo con Google no tienen contraseña utilizable.

## Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

La app queda en `http://localhost:5173`. `npm install` copia automáticamente los cores de ffmpeg.wasm (de un solo hilo y multi-hilo) a `public/ffmpeg/` y `public/ffmpeg-mt/` (se regeneran en cada instalación, no están en git por su tamaño).

### Core multi-hilo de ffmpeg.wasm

El editor usa el core multi-hilo (`@ffmpeg/core-mt`) cuando el navegador reporta `crossOriginIsolated`, y si no, cae automáticamente al de un solo hilo. Eso requiere que el servidor mande estos headers en la respuesta HTML (ya configurados en `vite.config.ts` para dev/preview):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Cualquier hosting de producción debe replicar estos dos headers**, o el editor simplemente usará el core de un solo hilo (más lento pero funcional, sin romper nada).

## Descargador de YouTube

Para suscriptores, antes del editor, la app muestra una pantalla para pegar el link de un video de YouTube y descargarlo (calidad configurable de 480p a 4K, con recorte opcional por tiempo) usando `yt-dlp` en el backend. El video descargado puede enviarse directo al editor como clip fuente, o el usuario puede saltarse este paso y subir su propio archivo como antes.

## Subtítulos automáticos (función futura)

Están desactivados: el editor solo exporta el video (con el texto opcional "PARTE N" cuando se divide en partes). El código se conservó sin conectar para retomarlo:

- **Frontend:** `lib/ass.ts` (`buildAssSubtitles` con resaltado de palabra activa, que hoy solo se usa para dibujar "PARTE N", y `sliceWordsForChunk`), `extractAudio` en `lib/ffmpeg.ts` y `transcriptionApi` en `lib/api.ts`. Falta reconectar el botón y la etapa de transcripción en `pages/EditorPage.tsx` (está en el historial de git).
- **Backend:** `api/routes/transcription.py` y `services/transcription_service.py` (Deepgram `nova-2`, timestamps por palabra). Para reactivarlo, registra el router en `main.py` y define `DEEPGRAM_API_KEY` en `backend/.env` (recuerda reiniciar el backend: el autorecargado no relee `.env`).
- **Fuente:** DejaVu Sans Bold (`frontend/public/fonts/`, licencia libre Bitstream Vera / DejaVu, ver `LICENSE.txt`).

## Gameplay de fondo

El usuario solo sube el clip fuente. El gameplay de fondo se elige de una librería fija que trae el propio editor (no hay descarga de contenido de terceros ni upload de gameplay).

**Para agregar gameplays:** copia archivos de video (`.mp4`, `.webm`, `.mov`, `.m4v`) a `frontend/src/assets/gameplays/` y reinicia `npm run dev` — aparecen automáticamente como opciones en el editor, sin tocar código (`frontend/src/lib/gameplays.ts` los detecta solo). El nombre del archivo se usa como etiqueta (p. ej. `subway-surfers.mp4` → "Subway Surfers").

Recomendado para cada archivo, para que no haya sorpresas de memoria ni de formato al exportar:
- Duración de al menos un par de minutos (si es más corto que el clip fuente, el editor lo repite en loop).
- Resolución moderada (720p le sobra — el editor igual lo reescala) y bien comprimido; evita archivos de cientos de MB.
- Cualquier frame rate está bien — el editor normaliza source y gameplay al mismo frame rate antes de combinarlos.

## Límites de memoria del navegador

Como el procesamiento corre 100% en el cliente, el editor rechaza archivos de más de 300MB cada uno (o 450MB combinados) con un mensaje claro, para evitar que la pestaña del navegador se quede sin memoria a mitad de un export.

Además, un clip fuente de más de 30s se **exporta en varias partes automáticamente** en vez de rechazarse: cada parte es un export independiente de hasta 30s, con su propio segmento de gameplay de fondo (o el gameplay en loop, si es más corto que el fuente) y su propio texto "PARTE N" si está activado. No hay límite en la cantidad de partes; un clip fuente más largo simplemente genera más partes, procesadas secuencialmente en el navegador (lo que toma más tiempo en total).
# molko
