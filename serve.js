const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8081;
const DIST = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url === '/api') {
    const proxyReq = http.request({
      hostname: 'localhost',
      port: 3000,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: 'localhost:3000' }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Local CRM offline' }));
    });
    req.pipe(proxyReq);
    return;
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(DIST, reqPath);

  // If browser requests old bundle hash, serve latest bundle
  if (reqPath.includes('_expo/static/js/web/') && !fs.existsSync(filePath)) {
    const webJsDir = path.join(DIST, '_expo/static/js/web');
    if (fs.existsSync(webJsDir)) {
      const files = fs.readdirSync(webJsDir);
      const js = files.find(f => f.endsWith('.js'));
      if (js) filePath = path.join(webJsDir, js);
    }
  } else if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading file');
      return;
    }
    let body = data;
    if (filePath.endsWith('index.html')) {
      let html = data.toString('utf-8');
      if (!html.includes('Merriweather+Sans')) {
        const fontTags = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Merriweather+Sans:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet">
    <style>
      html, body, #root, * {
        font-family: 'Merriweather Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      }
    </style>
        `;
        html = html.replace('</head>', `${fontTags}</head>`);
        body = Buffer.from(html, 'utf-8');
      }
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(body);
  });
});

server.listen(PORT, () => {
  console.log(`📱 HCP Admin App running locally on http://localhost:${PORT}`);
});
