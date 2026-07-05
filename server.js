const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const uploadDir = path.join(rootDir, "uploads");
const metadataPath = path.join(uploadDir, "installer.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const maxUploadBytes = 1024 * 1024 * 500;

const ownerCredentials = {
  user: process.env.OWNER_USER || "guigcs",
  password: process.env.OWNER_PASSWORD || "gui123",
};

const sessionSecret = process.env.SESSION_SECRET || "vetfinance-local-session";
const githubStorage = {
  token: process.env.GITHUB_TOKEN || "",
  owner: process.env.GITHUB_OWNER || "gcerantolasiqueira-gif",
  repo: process.env.GITHUB_REPO || "vetfinance-site",
  tag: process.env.GITHUB_RELEASE_TAG || "vetfinance-installer",
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".md": "text/markdown; charset=utf-8",
};

fs.mkdirSync(uploadDir, { recursive: true });

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({ owner: true, exp: Date.now() + 1000 * 60 * 60 * 8 })).toString("base64url");
  const signature = require("crypto").createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function isValidSession(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)vetfinance_owner=([^;]+)/);
  if (!match) return false;

  const [payload, signature] = match[1].split(".");
  if (!payload || !signature) return false;

  const expected = require("crypto").createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  if (signature !== expected) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.owner === true && data.exp > Date.now();
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  const body = await readRequestBody(request);
  return JSON.parse(body.toString("utf8") || "{}");
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > maxUploadBytes) {
        reject(new Error("Arquivo muito grande. Limite atual: 500 MB."));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = {};
  let cursor = 0;

  while (cursor < buffer.length) {
    const partStart = buffer.indexOf(delimiter, cursor);
    if (partStart === -1) break;

    let contentStart = partStart + delimiter.length;
    if (buffer[contentStart] === 45 && buffer[contentStart + 1] === 45) break;
    if (buffer[contentStart] === 13 && buffer[contentStart + 1] === 10) contentStart += 2;

    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), contentStart);
    if (headerEnd === -1) break;

    const headers = buffer.slice(contentStart, headerEnd).toString("latin1");
    const nextDelimiter = buffer.indexOf(delimiter, headerEnd + 4);
    if (nextDelimiter === -1) break;

    let dataEnd = nextDelimiter;
    if (buffer[dataEnd - 2] === 13 && buffer[dataEnd - 1] === 10) dataEnd -= 2;

    const data = buffer.slice(headerEnd + 4, dataEnd);
    const nameMatch = headers.match(/name="([^"]+)"/i);
    const fileNameMatch = headers.match(/filename="([^"]*)"/i);

    if (nameMatch) {
      const name = nameMatch[1];

      if (fileNameMatch) {
        files[name] = {
          fileName: path.basename(fileNameMatch[1]),
          data,
        };
      } else {
        fields[name] = data.toString("utf8");
      }
    }

    cursor = nextDelimiter;
  }

  return { fields, files };
}

function sanitizeInstallerName(fileName) {
  const safeName = path.basename(fileName || "VetFinance.exe").replace(/[^\w.\- ]+/g, "_");
  const extension = path.extname(safeName).toLowerCase();
  const allowedExtensions = new Set([".exe", ".msi", ".zip"]);

  if (!allowedExtensions.has(extension)) {
    throw new Error("Formato inválido. Envie um arquivo .exe, .msi ou .zip.");
  }

  return safeName || `VetFinance${extension}`;
}

function getInstallerMetadata() {
  if (!fs.existsSync(metadataPath)) return null;

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    if (metadata.provider === "github" && metadata.downloadUrl) {
      return metadata;
    }

    const installerPath = path.join(uploadDir, metadata.storedName || "");
    if (!fs.existsSync(installerPath)) return null;
    return { ...metadata, path: installerPath };
  } catch {
    return null;
  }
}

function isGithubStorageConfigured() {
  return Boolean(githubStorage.owner && githubStorage.repo);
}

function isGithubWriteConfigured() {
  return Boolean(githubStorage.token && githubStorage.owner && githubStorage.repo);
}

function githubRequest(pathname, options = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "VetFinance-Site",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {}),
  };

  if (githubStorage.token) {
    headers.Authorization = `Bearer ${githubStorage.token}`;
  }

  return fetch(`https://api.github.com${pathname}`, { ...options, headers });
}

function isInstallerAsset(asset) {
  return /^VetFinance.*\.(exe|msi|zip)$/i.test(asset.name || "");
}

async function getGithubInstallerMetadata() {
  if (!isGithubStorageConfigured()) return null;

  try {
    const releasePath = `/repos/${githubStorage.owner}/${githubStorage.repo}/releases/tags/${encodeURIComponent(githubStorage.tag)}`;
    const response = await githubRequest(releasePath);
    if (!response.ok) return null;

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets.filter(isInstallerAsset) : [];
    if (!assets.length) return null;

    assets.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
    const asset = assets[0];

    return {
      provider: "github",
      fileName: asset.name,
      size: asset.size,
      uploadedAt: asset.updated_at || asset.created_at || release.published_at || release.created_at,
      downloadUrl: asset.browser_download_url,
    };
  } catch {
    return null;
  }
}

async function getOrCreateRelease() {
  const releasePath = `/repos/${githubStorage.owner}/${githubStorage.repo}/releases/tags/${encodeURIComponent(githubStorage.tag)}`;
  let response = await githubRequest(releasePath);

  if (response.status === 200) return response.json();
  if (response.status !== 404) throw new Error("Não foi possível consultar a release do GitHub.");

  response = await githubRequest(`/repos/${githubStorage.owner}/${githubStorage.repo}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: githubStorage.tag,
      name: "VetFinance Installer",
      body: "Instalador atual do VetFinance.",
      draft: false,
      prerelease: false,
    }),
  });

  if (!response.ok) throw new Error("Não foi possível criar a release do GitHub.");
  return response.json();
}

async function uploadInstallerToGithub(fileName, data) {
  const release = await getOrCreateRelease();
  const assetsResponse = await githubRequest(`/repos/${githubStorage.owner}/${githubStorage.repo}/releases/${release.id}/assets`);

  if (!assetsResponse.ok) throw new Error("Não foi possível listar assets da release.");
  const assets = await assetsResponse.json();

  await Promise.all(
    assets
      .filter((asset) => asset.name.startsWith("VetFinance"))
      .map((asset) => githubRequest(`/repos/${githubStorage.owner}/${githubStorage.repo}/releases/assets/${asset.id}`, { method: "DELETE" })),
  );

  const uploadUrl = new URL(release.upload_url.replace("{?name,label}", ""));
  uploadUrl.searchParams.set("name", fileName);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubStorage.token}`,
      "Content-Type": "application/octet-stream",
      "User-Agent": "VetFinance-Site",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: data,
  });

  if (!response.ok) throw new Error("Não foi possível salvar o instalador no GitHub Releases.");
  const asset = await response.json();

  return {
    provider: "github",
    fileName,
    size: data.length,
    uploadedAt: new Date().toISOString(),
    downloadUrl: asset.browser_download_url,
  };
}

async function getCurrentInstallerMetadata() {
  return getInstallerMetadata() || (await getGithubInstallerMetadata());
}

async function serveInstallerStatus(response) {
  const metadata = await getCurrentInstallerMetadata();

  if (!metadata) {
    sendJson(response, 200, { available: false });
    return;
  }

  sendJson(response, 200, {
    available: true,
    fileName: metadata.fileName,
    size: metadata.size,
    uploadedAt: metadata.uploadedAt,
    storage: metadata.provider || "local",
  });
}

async function handleUpload(request, response) {
  const contentType = request.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    sendJson(response, 400, { error: "Upload inválido." });
    return;
  }

  try {
    const body = await readRequestBody(request);
    const { fields, files } = parseMultipart(body, boundaryMatch[1] || boundaryMatch[2]);

    if (!isValidSession(request) && (fields.user !== ownerCredentials.user || fields.password !== ownerCredentials.password)) {
      sendJson(response, 401, { error: "Usuário ou senha incorretos." });
      return;
    }

    const installer = files.installer;
    if (!installer || !installer.data.length) {
      sendJson(response, 400, { error: "Selecione o instalador antes de enviar." });
      return;
    }

    const safeName = sanitizeInstallerName(installer.fileName);

    if (isGithubWriteConfigured()) {
      const metadata = await uploadInstallerToGithub(safeName, installer.data);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      sendJson(response, 200, { available: true, ...metadata });
      return;
    }

    const storedName = `VetFinance-${Date.now()}${path.extname(safeName)}`;
    const destination = path.join(uploadDir, storedName);

    for (const file of fs.readdirSync(uploadDir)) {
      if (file !== "installer.json") {
        fs.rmSync(path.join(uploadDir, file), { force: true });
      }
    }

    fs.writeFileSync(destination, installer.data);

    const metadata = {
      fileName: safeName,
      storedName,
      size: installer.data.length,
      uploadedAt: new Date().toISOString(),
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    sendJson(response, 200, { available: true, ...metadata });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Não foi possível subir o instalador." });
  }
}

async function serveDownload(request, response) {
  const metadata = await getCurrentInstallerMetadata();

  if (!metadata) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Instalador não disponível.");
    return;
  }

  if (metadata.provider === "github" && metadata.downloadUrl) {
    response.writeHead(302, { Location: metadata.downloadUrl });
    response.end();
    return;
  }

  response.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${metadata.fileName.replace(/"/g, "")}"`,
    "Content-Length": metadata.size,
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  fs.createReadStream(metadata.path).pipe(response);
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const filePath = path.normalize(path.join(rootDir, pathname));

  if (!filePath.startsWith(rootDir) || filePath.startsWith(uploadDir)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Acesso negado.");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Arquivo não encontrado.");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "POST" && requestUrl.pathname === "/api/login") {
    readJsonBody(request)
      .then((data) => {
        if (data.user !== ownerCredentials.user || data.password !== ownerCredentials.password) {
          sendJson(response, 401, { error: "Usuário ou senha incorretos." });
          return;
        }

        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": `vetfinance_owner=${createSessionToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`,
        });
        response.end(JSON.stringify({ ok: true }));
      })
      .catch(() => sendJson(response, 400, { error: "Login inválido." }));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/installer") {
    serveInstallerStatus(response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/upload") {
    handleUpload(request, response);
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && requestUrl.pathname === "/download") {
    serveDownload(request, response);
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Método não permitido.");
});

server.listen(port, host, () => {
  console.log(`VetFinance publicado em http://${host}:${port}`);
});
