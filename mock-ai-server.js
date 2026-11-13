import http from 'node:http';

/**
 * Tiny mock of the Python ANPR service, for local testing without YOLO/OCR.
 * It does not process images; it always returns the configured plate.
 *
 * Run:  npm run mock-ai
 */
const port = Number(process.env.MOCK_AI_PORT || 8000);
const numberPlate = process.env.MOCK_AI_PLATE || 'UP32AB1234';
const confidence = Number(process.env.MOCK_AI_CONFIDENCE || 0.96);

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/recognize') {
    // Read and discard the multipart body before responding.
    req.on('data', () => {});
    req.on('end', () => {
      console.log(`[mock-ai] Recognition request received -> ${numberPlate} (${confidence})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          numberPlate,
          confidence,
        }),
      );
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, message: 'Not found' }));
});

server.listen(port, () => {
  console.log(`[mock-ai] Mock AI service running on http://127.0.0.1:${port}`);
  console.log(`[mock-ai] POST /recognize returns ${numberPlate} with confidence ${confidence}`);
});
