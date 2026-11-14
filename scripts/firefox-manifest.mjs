/*
 * Firefox runs the same extension, but Manifest V3 means something slightly
 * different there:
 *
 *  - background work is an event page (`background.scripts`), not a service
 *    worker;
 *  - extensions want a stable Gecko id for storage and updates;
 *  - `minimum_chrome_version` is meaningless and is dropped.
 *
 * Everything else - permissions, host permissions, icons, the popup - is
 * shared, so `manifest.json` stays the single source of truth and the Firefox
 * manifest is generated from it rather than maintained by hand.
 */

export const GECKO_ID = 'etlab-survey-skip@emilshain';
export const GECKO_MIN_VERSION = '121.0';

export function firefoxManifest(chromium, options = {}) {
  const out = JSON.parse(JSON.stringify(chromium));

  delete out.minimum_chrome_version;

  const worker = chromium.background && chromium.background.service_worker;
  if (!worker) {
    throw new Error('manifest.json has no background.service_worker to convert');
  }

  out.background = { scripts: [worker] };
  out.browser_specific_settings = {
    gecko: {
      id: options.id || GECKO_ID,
      strict_min_version: options.minVersion || GECKO_MIN_VERSION
    }
  };

  return out;
}
