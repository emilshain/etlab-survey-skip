(async () => {
  const token = localStorage.getItem('access_token') || '';
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem('user_data') || '{}');
  } catch (e) {}

  const headers = { Authorization: 'Bearer ' + token };
  if (user.institute_id) headers['X-Institute-ID'] = String(user.institute_id);

  const base = 'https://api.students.etlab.app/api/v1';
  const now = new Date();
  const months = [
    { m: now.getMonth() + 1, y: now.getFullYear() },
    { m: (now.getMonth() + 1) % 12 + 1, y: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear() }
  ];

  const out = [];
  for (const { m, y } of months) {
    const url = `${base}/calendar?month=${m}&year=${y}`;
    const res = await fetch(url, { headers });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {}
    out.push({
      url,
      status: res.status,
      bytes: text.length,
      topKeys: json && typeof json === 'object' ? Object.keys(json) : null,
      sample: text.slice(0, 1500)
    });
  }

  return JSON.stringify(out, null, 1);
})()
