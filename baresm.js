const CACHE_NAME = "node_modules";

function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

const bareModuleSpecifiersRegex = /(?:(?:import)|(?:export))\s+.*\s+from\s+(['"].*['"]);/g;

const lookup = {};

async function resolveModule(key, base) {
  if (lookup[key]) {
    return lookup[key];
  }

  if (base.endsWith(".js") || base.endsWith(".mjs")) {
    lookup[key] = base;
    return base;
  }

  const [baseJs, baseMjs, packageRes] = await Promise.all([
    fetch(`${base}.js`, { method: "HEAD" }),
    fetch(`${base}.mjs`, { method: "HEAD" }),
    fetch(`${base}/package.json`)
  ]);

  if (baseJs && baseJs.status === 200) {
    lookup[key] = `${base}.js`;
    return `${base}.js`;
  }

  if (baseMjs && baseMjs.status === 200) {
    lookup[key] = `${base}.mjs`;
    return `${base}.mjs`;
  }

  if (packageRes && packageRes.status === 200) {
    const package = await packageRes.json();

    const entry = package.module || package.main || null;

    if (!entry) {
      console.error(`Malformed package, missing 'module' or 'main' attribute: ${base}/package.json`, key, base);
      return null;
    }

    lookup[key] = `${base}/${entry}`;

    return `${base}/${entry}`;
  }

  const [indexJs, indexMjs] = await Promise.all([
    fetch(`${base}/index.js`, { method: "HEAD" }),
    fetch(`${base}/index.mjs`, { method: "HEAD" })
  ]);

  if (indexJs && indexJs.status === 200) {
    lookup[key] = `${base}/index.js`;
    return `${base}/index.js`;
  }

  if (indexMjs && indexMjs.status === 200) {
    lookup[key] = `${base}/index.mjs`;
    return `${base}/index.mjs`;
  }

  console.warn("Unable to resolve ES6 module, is it installed?", key, base);

  return null;
}

async function repath(body, pwd) {
  const modules = {};

  const pseudo = body.replace(bareModuleSpecifiersRegex, (match, module) => {
    const quote = module[0];

    const key = module.slice(1, -1)

    let moduleBase = `/node_modules/${key}`;

    if (key.startsWith(".") || key.startsWith("/") || key.startsWith("http:") || key.startsWith("https:")) {
      if (key.endsWith(".js") || key.endsWith(".mjs")) {
        return match.replace(module, `${quote}${key}${quote}`);
      }

      moduleBase = `${pwd}/${key}`;
    }

    const id = uuidv4();

    modules[id] = {
      key: key,
      base: moduleBase,
      quote: quote,
      entryResolver: resolveModule(key, moduleBase).then(entry => {
        modules[id].entry = entry;
      })
    };

    return match.replace(module, id);
  });

  await Promise.all(Object.keys(modules).map(id => modules[id].entryResolver));

  let resolvedBody = pseudo;

  for(let id of Object.keys(modules)) {
    const module = modules[id];

    const resolved = `${module.quote}${module.entry || module.key}${module.quote}`;

    resolvedBody = resolvedBody.replace(id, resolved);
  }

  return resolvedBody;
}

async function resolve(event) {
  const cache = await caches.open(CACHE_NAME);

  const cached = await cache.match(event.request);

  if (cached) {
    return cached;
  }

  const res = await fetch(event.request);

  const resp = res.clone();

  const contentType = resp.headers.get("Content-Type");

  if (contentType !== "application/javascript" && contentType !== "text/javascript") {
    return res;
  }

  const body = await resp.text();
  const path = (new URL(event.request.url)).pathname
  const pwd = path.substring(0, path.lastIndexOf("/"));

  const resolvedBody = await repath(body, pwd);

  const resolvedModuleResponse = new Response(resolvedBody, {
    status: resp.status,
    headers: resp.headers,
    statusText: resp.statusText
  });

  cache.put(event.request, resolvedModuleResponse.clone());

  return resolvedModuleResponse;
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.delete(CACHE_NAME));
});

self.addEventListener("fetch", event => {
  event.respondWith(resolve(event));
});
