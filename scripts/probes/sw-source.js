(() => {
  const out = { hasCallEngine: typeof callEngine === 'function' };
  if (out.hasCallEngine) {
    out.source = callEngine.toString().replace(/\s+/g, ' ').slice(0, 260);
    out.guardsUndefined = /arg === undefined \? null : arg/.test(callEngine.toString());
  }
  out.engineFiles = typeof ENGINE_FILES !== 'undefined' ? ENGINE_FILES : null;
  return JSON.stringify(out, null, 1);
})()
