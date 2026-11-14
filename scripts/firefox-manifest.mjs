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
// 140 is the first Firefox that understands data_collection_permissions, which
// AMO now requires; declaring both at once keeps the manifest self-consistent
// (web-ext lint flags the mismatch otherwise).
export const GECKO_MIN_VERSION = '140.0';

export const SUMMARY_SCRIPT = 'src/summary.js';

export function firefoxManifest(chromium, options = {}) {
  const out = JSON.parse(JSON.stringify(chromium));

  delete out.minimum_chrome_version;

  const worker = chromium.background && chromium.background.service_worker;
  if (!worker) {
    throw new Error('manifest.json has no background.service_worker to convert');
  }

  // The event page has no importScripts, so shared code is listed explicitly.
  out.background = { scripts: [SUMMARY_SCRIPT, worker] };
  out.browser_specific_settings = {
    gecko: {
      id: options.id || GECKO_ID,
      strict_min_version: options.minVersion || GECKO_MIN_VERSION,
      // Required for new AMO submissions. This extension talks to your own
      // ETLab tabs and to chrome.storage and nothing else: no analytics, no
      // remote server, no third party.
      data_collection_permissions: { required: ['none'] }
    },
    // The same key reached Firefox for Android in 142; without this the
    // validator reports the Android minimum as inconsistent. Android itself is
    // untested - the popup is desktop-sized - so this only keeps the manifest
    // valid, it is not a support claim.
    gecko_android: { strict_min_version: '142.0' }
  };

  return out;
}
