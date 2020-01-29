function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}


const bareModuleSpecifiersRegex = /import\s+.*\s+from\s+(['"].*['"]);/g;

async function resolveModule(base) {

  if (base.endsWith(".js") || base.endsWith(".mjs")) {
    console.log(base);
    return base;
  }

  if (base.split("/").length > 4) {
    return `${base}.js`; //fixme
  }
  
  const res = await fetch(`${base}/package.json`);
  
  if (!res || res.status !== 200) {
    return null;
  }

  const package = await res.json();

  const entry = package.module || package.main || null;

  if (!entry) {
    return null;
  }

  return `${base}/${entry}`;
}

async function repath(body) {
  
  const modules = {};
  
  const pseudo = body.replace(bareModuleSpecifiersRegex, (match, module) => {
    console.log(match);
    
    const quote = module[0];

    const key = module.slice(1, -1)

    if (key.startsWith(".") || key.startsWith("/")) {
      if (key.endsWith(".js") || key.endsWith(".mjs")) {
        return match.replace(module, `${quote}${key}${quote}`);
      }

      return match.replace(module, `${quote}${key}${quote}.js`); //fixme
    }
    
    const moduleBase = `/node_modules/${key}`;
    
    const id = uuidv4();
    
    modules[id] = {
      key: key,
      base: moduleBase,
      quote: quote,
      entryResolver: resolveModule(moduleBase).then(entry => {
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

    console.log(resolved);

    resolvedBody = resolvedBody.replace(id, resolved);
  }

  // console.log(resolvedBody);

  return resolvedBody;
}

async function resolve(event) {
  
  
  const res = await fetch(event.request);
  
  const resp = res.clone();
  
  if (resp.headers.get("Content-Type") !== "application/javascript") {
    return res;
  }
  
  
  const body = await resp.text();
  
  const resolvedBody = await repath(body);

  return new Response(resolvedBody, {
    status: resp.status,
    headers: resp.headers,
    statusText: resp.statusText
  });
}

self.addEventListener("fetch", event => {
  
  event.respondWith(resolve(event));
  
});
