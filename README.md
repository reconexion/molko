# Molko

MVP de Molko: editor web de video "brainrot" (clip fuente arriba + gameplay de fondo abajo, subtítulos automáticos con resaltado de palabra activa, formato vertical 9:16). Ver `docs/Molko_Documento_Maestro.docx` para la especificación completa de producto.

**Alcance de este MVP (Fase 1 del roadmap):** modo Brainrot con video propio subido por el usuario y subtítulos automáticos con fuente predefinida, sin cuentas de usuario. Login/registro, suscripción de pago, descargador de YouTube, Modo Historias y divisor de video largo quedan para fases posteriores y no están implementados por ahora — el foco actual es la funcionalidad del editor.

## Arquitectura

- **Frontend:** React + Vite. Todo el procesamiento de video (overlay, quemado de subtítulos, export) corre en el navegador con `@ffmpeg/ffmpeg` (ffmpeg.wasm) — el backend nunca recibe ni almacena los videos del usuario.
- **Backend:** Python + FastAPI. Solo un proxy de transcripción hacia Deepgram (para no exponer la API key en el cliente). Sin base de datos ni cuentas de usuario por ahora.
- **Transcripción:** [Deepgram](https://deepgram.com) (modelo `nova-2`), devuelve timestamps por palabra que alimentan el resaltado de palabra activa en los subtítulos.

## Requisitos

- Python 3.12+
- Node.js 20+
- Una API key de [Deepgram](https://console.deepgram.com) (para subtítulos)

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edita `backend/.env` con tu `DEEPGRAM_API_KEY`.

```bash
uvicorn app.main:app --reload --port 8000
```

La API queda en `http://localhost:8000` (docs interactivas en `/docs`).

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

## Fuente de subtítulos

Los subtítulos usan DejaVu Sans Bold (`frontend/public/fonts/`), una fuente de licencia libre (Bitstream Vera / DejaVu, ver `LICENSE.txt` junto al archivo) — es la única fuente del MVP, sin personalización.

## Gameplay de fondo

El usuario solo sube el clip fuente. El gameplay de fondo se elige de una librería fija que trae el propio editor (no hay descarga de contenido de terceros ni upload de gameplay).

**Para agregar gameplays:** copia archivos de video (`.mp4`, `.webm`, `.mov`, `.m4v`) a `frontend/src/assets/gameplays/` y reinicia `npm run dev` — aparecen automáticamente como opciones en el editor, sin tocar código (`frontend/src/lib/gameplays.ts` los detecta solo). El nombre del archivo se usa como etiqueta (p. ej. `subway-surfers.mp4` → "Subway Surfers").

Recomendado para cada archivo, para que no haya sorpresas de memoria ni de formato al exportar:
- Duración de al menos un par de minutos (si es más corto que el clip fuente, el editor lo repite en loop).
- Resolución moderada (720p le sobra — el editor igual lo reescala) y bien comprimido; evita archivos de cientos de MB.
- Cualquier frame rate está bien — el editor normaliza source y gameplay al mismo frame rate antes de combinarlos.

## Límites de memoria del navegador

Como el procesamiento corre 100% en el cliente, el editor rechaza archivos de más de 300MB cada uno (o 450MB combinados) con un mensaje claro, para evitar que la pestaña del navegador se quede sin memoria a mitad de un export.

Además, un clip fuente de más de 30s se **exporta en varias partes automáticamente** en vez de rechazarse: cada parte es un export independiente de hasta 30s, con su propio segmento de gameplay de fondo (o el gameplay en loop, si es más corto que el fuente) y sus propios subtítulos si aplica. El límite es 30 partes (~15 minutos de fuente); más que eso sí se rechaza, porque cada parte se procesa secuencialmente en el navegador.
# molko
