# Smart Gate Backend

A small Node.js + Express HTTP backend for an AI-based ANPR (Automatic Number
Plate Recognition) smart gate.

The ESP32-CAM sends an image to this server. The server sends that image to a
separate Python YOLO + OCR service, gets a number plate and confidence score,
checks the plate in MongoDB, writes an access log, and returns `OPEN` or
`CLOSED`.

> This repository contains **only the Node.js backend**. It does not contain
> ESP32 firmware, servo/LED code, YOLO training, or OCR code.

---

## 1. How it works

```text
ESP32-CAM
   │  POST /api/v1/vehicle/detect
   │  multipart/form-data: image + deviceId
   │  header: x-api-key
   ▼
Express server
   │  1. Check device API key
   │  2. Save temporary image with Multer
   │  3. POST image to Python AI service
   │  4. Validate plate and confidence
   │  5. Normalize plate (UP 32 AB 1234 -> UP32AB1234)
   │  6. Find vehicle in MongoDB
   │  7. Check isAuthorized and validUntil
   │  8. Save access log
   │  9. Delete temporary image
   ▼
JSON response: OPEN / CLOSED
```

**The gate fails closed.** If the AI service, database, image, or request is
invalid, the response is always:

```json
{
  "success": false,
  "numberPlate": null,
  "authorized": false,
  "gateAction": "CLOSED",
  "message": "Number plate recognition failed"
}
```

Only a vehicle that exists, is authorized, and has not expired receives
`"gateAction": "OPEN"`.

---

## 2. Folder structure

```text
smart-gate-backend/
├── config/
│   ├── db.js                 # MongoDB connection and readiness check
│   └── env.js                # Loads .env and validates configuration
├── models/
│   ├── Vehicle.js            # Vehicle schema (unique, normalized plate)
│   └── AccessLog.js          # Access attempt schema
├── routes/
│   ├── detectionRoutes.js    # POST /api/v1/vehicle/detect
│   ├── vehicleRoutes.js      # Vehicle CRUD
│   └── logRoutes.js          # Access log endpoints
├── controllers/
│   ├── detectionController.js # Detection workflow and access logging
│   ├── vehicleController.js   # Vehicle CRUD
│   └── logController.js       # Access-log endpoints
├── middleware/
│   ├── auth.js                # Device and admin API key checks
│   ├── errorHandler.js        # Central error -> CLOSED response mapping
│   └── upload.js              # Multer image upload validation
├── services/
│   └── aiService.js           # Calls and validates the Python AI service
├── utils/
│   ├── AppError.js            # Expected error with safe HTTP status
│   ├── apiResponse.js         # Consistent detection/error response shape
│   └── normalizePlate.js      # "UP 32 AB 1234" -> "UP32AB1234"
├── uploads/                   # Temporary images only; never exposed publicly
├── mock-ai-server.js          # Optional local fake AI service for testing
├── server.js                  # Express app, routes, errors, startup
├── package.json
├── .env                       # Local secrets (gitignored)
├── .env.example               # Safe example configuration
└── .gitignore
```

### How the files are organized

The project stays small and follows the order in which a request is handled:

| File/folder | Responsibility |
| --- | --- |
| `routes/` | URL mapping, authentication, and upload middleware |
| `controllers/` | Request validation, response shape, and the detection flow |
| `services/aiService.js` | External AI call and response validation |
| `models/` | Schemas, validation, and unique indexes |
| `middleware/` | Authentication, upload validation, and error handling |
| `config/` | Environment validation and database connection |
| `utils/` | Shared errors, response helpers, and plate normalization |
| `server.js` | Express setup, health check, routes, and startup |

The complete gate workflow is intentionally visible in
`controllers/detectionController.js`: recognize the plate, check confidence,
find the vehicle, apply the authorization/expiry rules, save the log, respond,
and delete the temporary image.

To change gate behavior:

- Confidence threshold: `MIN_OCR_CONFIDENCE` in `.env`.
- Authorization/expiry rule: `detectVehicle()` in
  `controllers/detectionController.js`.
- JSON response fields: `utils/apiResponse.js`.

---

## 3. Prerequisites

- Node.js 20 or newer (`node --version`)
- npm
- MongoDB 6/7/8 running locally, in Docker, or MongoDB Atlas
- Your Python AI service running separately (or use `npm run mock-ai`)

---

## 4. Install

```bash
npm install
```

---

## 5. Environment configuration

If `.env` does not exist:

```bash
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Edit `.env`:

```env
PORT=5000
NODE_ENV=development

MONGODB_URI=mongodb://127.0.0.1:27017/smart_gate

AI_SERVICE_URL=http://127.0.0.1:8000
AI_RECOGNITION_ENDPOINT=/recognize
AI_TIMEOUT_MS=15000

ESP32_API_KEY=change_this_device_key
ADMIN_API_KEY=change_this_admin_key

MIN_OCR_CONFIDENCE=0.80
MAX_FILE_SIZE_MB=5
```

| Variable | Meaning |
| --- | --- |
| `PORT` | HTTP port for Express (default `5000`) |
| `MONGODB_URI` | Local MongoDB or Atlas connection string |
| `AI_SERVICE_URL` | Base URL of the Python AI service |
| `AI_RECOGNITION_ENDPOINT` | Recognition path (default `/recognize`) |
| `AI_TIMEOUT_MS` | Abort AI requests after this time (default `15000`) |
| `ESP32_API_KEY` | Key the ESP32-CAM sends in `x-api-key` |
| `ADMIN_API_KEY` | Separate key for vehicle/log management |
| `MIN_OCR_CONFIDENCE` | Minimum confidence from `0` to `1` |
| `MAX_FILE_SIZE_MB` | Maximum upload size |

### Generate strong keys

macOS / Linux:

```bash
openssl rand -hex 32
```

PowerShell:

```powershell
-Join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
```

Use two **different** values. Never commit `.env`; it is already in
`.gitignore`. The included keys are development placeholders and must be
replaced before real use.

> If an older `.env` exists, it is intentionally preserved. Any extra keys in
> it are ignored by this application.

---

## 6. Start MongoDB

Choose one option.

### Option A: Docker

```bash
docker run --name smart-gate-mongo -p 27017:27017 -d mongo:7
```

Check it:

```bash
docker ps
```

Stop it later:

```bash
docker stop smart-gate-mongo
```

### Option B: MongoDB Community Server installed locally

macOS (Homebrew):

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

Windows: install MongoDB Community Server, then start the MongoDB service from
Services, or run:

```powershell
mongod --dbpath "C:\data\db"
```

Linux: start the service for your distribution, for example:

```bash
sudo systemctl start mongod
```

The default local URI is:

```text
mongodb://127.0.0.1:27017/smart_gate
```

### Option C: MongoDB Atlas

Create a free cluster, create a database user, allow your IP address, and put
the connection string in `.env`:

```env
MONGODB_URI=mongodb+srv://<USERNAME>:<PASSWORD>@<CLUSTER>/smart_gate
```

Replace all `<...>` values. Never invent or commit real credentials.

If MongoDB is unavailable, the server still starts, but all API routes return
HTTP 503 with `gateAction: "CLOSED"`. It retries every 10 seconds.

---

## 7. Start the server

Development mode (auto-restarts on file changes):

```bash
npm run dev
```

Normal mode:

```bash
npm start
```

Check health:

```bash
curl http://localhost:5000/health
```

Expected when MongoDB is connected:

```json
{
  "success": true,
  "status": "ok",
  "database": "connected",
  "uptimeSeconds": 5,
  "timestamp": "2026-11-10T10:00:00.000Z"
}
```

---

## 8. Python AI service contract

Your separate Python service must expose something like:

```text
POST http://127.0.0.1:8000/recognize
Content-Type: multipart/form-data
Field: image
```

Successful response:

```json
{
  "success": true,
  "numberPlate": "UP32AB1234",
  "confidence": 0.96
}
```

Rules:

- `success` must be a boolean.
- `numberPlate` must be a non-empty string when `success` is `true`.
- `confidence` must be a number from `0` to `1`.
- The backend normalizes the plate itself.
- A timeout, invalid JSON, invalid confidence, or connection failure is never
  authorized.

### Test without the Python model

A mock service is included:

```bash
npm run mock-ai
```

It listens on port `8000` and always returns `UP32AB1234` with confidence
`0.96`. Keep the real `.env` AI URL for local testing:

```env
AI_SERVICE_URL=http://127.0.0.1:8000
```

You can change the mock response:

```bash
# macOS / Linux
MOCK_AI_PLATE=DL01AA0001 MOCK_AI_CONFIDENCE=0.99 npm run mock-ai
```

```powershell
# PowerShell
$env:MOCK_AI_PLATE="DL01AA0001"; $env:MOCK_AI_CONFIDENCE="0.99"; npm run mock-ai
```

---

## 9. API endpoints

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/vehicle/detect` | Device key | Recognize a vehicle and decide OPEN/CLOSED |
| `POST` | `/api/v1/vehicles` | Admin key | Register a vehicle |
| `GET` | `/api/v1/vehicles` | Admin key | List vehicles (newest first) |
| `GET` | `/api/v1/vehicles/:id` | Admin key | Get one vehicle |
| `PUT` | `/api/v1/vehicles/:id` | Admin key | Update a vehicle |
| `DELETE` | `/api/v1/vehicles/:id` | Admin key | Delete a vehicle |
| `GET` | `/api/v1/logs` | Admin key | List recent access logs |
| `GET` | `/api/v1/logs/:id` | Admin key | Get one access log |
| `GET` | `/health` | None | Server and MongoDB status |

Authentication header for every protected request:

```text
x-api-key: <your-key>
```

### Vehicle object

```json
{
  "numberPlate": "UP32AB1234",
  "ownerName": "Rahul Sharma",
  "vehicleType": "Car",
  "ownerType": "Student",
  "isAuthorized": true,
  "validUntil": null
}
```

`ownerType` can be any text, for example `Student`, `Faculty`, `Staff`,
`Resident`, or `Visitor`. `validUntil` is optional: `null` means no expiry.

---

## 10. Vehicle detection request

### Request

```text
POST /api/v1/vehicle/detect
x-api-key: <ESP32_API_KEY>
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `image` | file | Yes | JPEG, JPG, or PNG image |
| `deviceId` | text | Yes | Example: `ESP32-CAM-01` |

Example using curl (macOS / Linux):

```bash
curl -X POST http://localhost:5000/api/v1/vehicle/detect \
  -H "x-api-key: $ESP32_API_KEY" \
  -F "image=@car.jpg" \
  -F "deviceId=ESP32-CAM-01"
```

PowerShell:

```powershell
curl.exe -X POST http://localhost:5000/api/v1/vehicle/detect `
  -H "x-api-key: $env:ESP32_API_KEY" `
  -F "image=@car.jpg" `
  -F "deviceId=ESP32-CAM-01"
```

### Authorized response (HTTP 200)

```json
{
  "success": true,
  "requestId": "a3f6c2e1-7b9d-4c1a-9e2f-6d8a0b4c5e71",
  "numberPlate": "UP32AB1234",
  "authorized": true,
  "gateAction": "OPEN",
  "message": "Access Granted",
  "reason": "Vehicle is registered and authorized"
}
```

### Unregistered vehicle (HTTP 200)

```json
{
  "success": true,
  "requestId": "9e2f6d8a-0b4c-5e71-a3f6-c2e17b9d4c1a",
  "numberPlate": "UP32XY5678",
  "authorized": false,
  "gateAction": "CLOSED",
  "message": "Access Denied",
  "reason": "Vehicle not registered"
}
```

### Expired authorization (HTTP 200)

```json
{
  "success": true,
  "requestId": "2c1a9e2f-6d8a-0b4c-5e71-a3f6c2e17b9d",
  "numberPlate": "UP32AB1234",
  "authorized": false,
  "gateAction": "CLOSED",
  "message": "Access Denied",
  "reason": "Vehicle authorization expired"
}
```

### Recognition failure or low confidence (HTTP 200)

```json
{
  "success": false,
  "requestId": "7b9d4c1a-9e2f-6d8a-0b4c-5e71a3f6c2e1",
  "numberPlate": null,
  "authorized": false,
  "gateAction": "CLOSED",
  "message": "Number plate recognition failed",
  "reason": "OCR confidence is below the configured threshold"
}
```

### Server / AI failure (HTTP 5xx)

```json
{
  "success": false,
  "requestId": "4c1a9e2f-6d8a-0b4c-5e71-a3f6c2e17b9d",
  "numberPlate": null,
  "authorized": false,
  "gateAction": "CLOSED",
  "message": "Number plate recognition failed",
  "reason": "AI service timed out"
}
```

Possible statuses:

| Status | Meaning |
| --- | --- |
| `400` | Missing image/deviceId or bad request |
| `401` | Missing/invalid API key |
| `413` | Image larger than `MAX_FILE_SIZE_MB` |
| `415` | Unsupported image type |
| `502` | Invalid AI response |
| `503` | AI service or MongoDB unavailable |
| `504` | AI service timeout |
| `200` | Decision completed (check `authorized`/`gateAction`) |

---

## 11. Vehicle management examples

All require `x-api-key: <ADMIN_API_KEY>`.

### Register

```bash
curl -X POST http://localhost:5000/api/v1/vehicles \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ADMIN_API_KEY" \
  -d '{
    "numberPlate": "UP 32 AB 1234",
    "ownerName": "Rahul Sharma",
    "vehicleType": "Car",
    "ownerType": "Student",
    "isAuthorized": true,
    "validUntil": null
  }'
```

The stored plate is normalized to `UP32AB1234`. Registering the same plate again
returns HTTP `409`.

### List

```bash
curl http://localhost:5000/api/v1/vehicles -H "x-api-key: $ADMIN_API_KEY"
```

Response:

```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "665f1d3e8a2b4c0012a4d9e1",
      "numberPlate": "UP32AB1234",
      "ownerName": "Rahul Sharma",
      "vehicleType": "Car",
      "ownerType": "Student",
      "isAuthorized": true,
      "validUntil": null,
      "createdAt": "2026-11-10T10:00:00.000Z",
      "updatedAt": "2026-11-10T10:00:00.000Z"
    }
  ]
}
```

### Get, update, delete

```bash
curl http://localhost:5000/api/v1/vehicles/<id> -H "x-api-key: $ADMIN_API_KEY"

curl -X PUT http://localhost:5000/api/v1/vehicles/<id> \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ADMIN_API_KEY" \
  -d '{"isAuthorized": false}'

curl -X DELETE http://localhost:5000/api/v1/vehicles/<id> \
  -H "x-api-key: $ADMIN_API_KEY"
```

Unknown IDs return HTTP `404`.

---

## 12. Access logs

```bash
# Latest 50 logs
curl http://localhost:5000/api/v1/logs -H "x-api-key: $ADMIN_API_KEY"

# Change the limit (maximum 200)
curl "http://localhost:5000/api/v1/logs?limit=100" -H "x-api-key: $ADMIN_API_KEY"

# One log
curl http://localhost:5000/api/v1/logs/<id> -H "x-api-key: $ADMIN_API_KEY"
```

Example log:

```json
{
  "_id": "665f1d3e8a2b4c0012a4d9e1",
  "numberPlate": "UP32AB1234",
  "deviceId": "ESP32-CAM-01",
  "authorized": true,
  "gateAction": "OPEN",
  "reason": "Vehicle is registered and authorized",
  "confidence": 0.96,
  "timestamp": "2026-11-10T10:15:00.000Z",
  "requestId": "a3f6c2e1-7b9d-4c1a-9e2f-6d8a0b4c5e71"
}
```

The unique `requestId` prevents duplicate logs for the same detection request.
Images are **not** stored in the database; the temporary upload is deleted after
every request.

---

## 13. Testing with Postman

1. Start MongoDB.
2. Start the mock AI: `npm run mock-ai`.
3. Start the backend: `npm run dev`.
4. Register a vehicle with `POST /api/v1/vehicles` using the admin key.
5. Create a detection request:
   - Method: `POST`
   - URL: `http://localhost:5000/api/v1/vehicle/detect`
   - Header: `x-api-key` = your `ESP32_API_KEY`
   - Body: `form-data`
     - `image` = File (choose a JPEG/PNG)
     - `deviceId` = `ESP32-CAM-01`
6. Send and check `gateAction`.
7. Change the mock plate (`MOCK_AI_PLATE`) to a plate that is not registered to
   test `CLOSED`.
8. Try removing `x-api-key` to test `401`.

Tested cases in this project:

- Authorized vehicle -> `OPEN`
- Unregistered vehicle -> `CLOSED`
- Expired vehicle -> `CLOSED`
- `isAuthorized: false` -> `CLOSED`
- Low OCR confidence -> `CLOSED`
- AI recognition failure -> `CLOSED`
- AI HTTP 500 -> `503 CLOSED`
- AI timeout -> `504 CLOSED`
- Missing device key -> `401 CLOSED`
- Invalid image type -> `415 CLOSED`
- Missing image -> `400 CLOSED`
- Duplicate plate -> `409`
- Temporary image cleanup after every request

No real YOLO/OCR model is needed for these tests.

---

## 14. Troubleshooting

### `MongoDB connection failed: connect ECONNREFUSED 127.0.0.1:27017`

MongoDB is not running. Start it (see section 6) or fix `MONGODB_URI`. The API
returns `503 CLOSED` until the database is reachable and indexes are ready.

### API returns `503 Database is unavailable. Access denied.`

- Check MongoDB is running.
- Check `/health`; wait a moment after startup for indexes.
- Check the MongoDB host/port and Atlas IP allowlist.
- If using Atlas, URL-encode special characters in the password.

### `Invalid or missing device API key` (401)

The header must be exactly `x-api-key` and must equal `ESP32_API_KEY`. The admin
key is not accepted on the detection endpoint.

### `Invalid or missing admin API key` (401)

Use `ADMIN_API_KEY`, not the ESP32 key.

### `413 Image is too large`

Increase `MAX_FILE_SIZE_MB` or send a smaller image. Restart the server after
changing `.env`.

### `415 Only JPEG, JPG and PNG images are allowed`

Send a real image with the correct MIME type and extension. Filename extensions
must match the content type.

### AI errors (`502`, `503`, `504`)

- Is the Python service running?
- Does `AI_SERVICE_URL + AI_RECOGNITION_ENDPOINT` work?
- Is the Python service reachable from this machine (firewall, LAN IP)?
- Does it return the exact JSON structure in section 8?
- Increase `AI_TIMEOUT_MS` if recognition is slow.

### Port 5000 already in use

Change `PORT` in `.env`, or stop the other process.

### Temporary files remain in `uploads/`

Normal requests delete them in a `finally` block. If an unusual crash happens,
you can safely delete old files manually:

```bash
# macOS / Linux
rm -f uploads/*.jpg uploads/*.jpeg uploads/*.png
```

```powershell
# PowerShell
Remove-Item uploads\*.jpg, uploads\*.jpeg, uploads\*.png -ErrorAction SilentlyContinue
```

---

## 15. Production notes

Before deploying:

1. Replace `ESP32_API_KEY` and `ADMIN_API_KEY` with two different random values.
2. Use a real MongoDB URI and restrict network access.
3. Point `AI_SERVICE_URL` at the reachable Python service.
4. Set `NODE_ENV=production`.
5. Serve the API behind HTTPS (for example Nginx or a cloud load balancer).
6. Never expose the `uploads/` folder or `.env`.
7. Add rate limiting at the reverse proxy if the API is public.
8. Back up MongoDB and monitor logs.
9. Keep the gate's fail-closed behavior: never change an error response to
   `OPEN`.

---

## 16. Useful commands

```bash
npm install       # install dependencies
npm run dev       # start with nodemon
npm start         # start normally
npm run mock-ai   # start fake AI service on port 8000
npm audit         # check dependency vulnerabilities
```
