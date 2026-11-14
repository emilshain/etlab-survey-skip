(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = document.getElementById('log');
  log.textContent = '';
  document.getElementById('fillThis').click();
  await sleep(3000);
  return JSON.stringify({ log: log.innerText.replace(/\s+/g, ' ').slice(0, 300) });
})()
