(async () => {
  const token = localStorage.getItem('access_token') || '';
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem('user_data') || '{}');
  } catch (e) {}

  const bases = [
    'https://api.students.etlab.app',
    'https://api.students.etlab.app/v1',
    'https://api.students.etlab.app/v2',
    'https://api.students.etlab.app/student',
    'https://students.etlab.app/api'
  ];
  const path = '/examschedules/calendar-feed';

  const headerSets = [];
  const base = { Authorization: 'Bearer ' + token };
  headerSets.push({ name: 'bearer', headers: base });
  if (user.institute_id) {
    headerSets.push({
      name: 'bearer+institute',
      headers: { ...base, 'X-Institute-ID': String(user.institute_id) }
    });
  }

  const results = [];
  for (const b of bases) {
    for (const hs of headerSets) {
      try {
        const res = await fetch(b + path, { headers: hs.headers });
        const text = await res.text();
        results.push({
          url: b + path,
          headers: hs.name,
          status: res.status,
          type: res.headers.get('content-type'),
          bytes: text.length,
          sample: text.slice(0, 100).replace(/\s+/g, ' ')
        });
      } catch (e) {
        results.push({ url: b + path, headers: hs.name, error: e.message.slice(0, 60) });
      }
    }
  }

  return JSON.stringify({ hasInstituteId: !!user.institute_id, results }, null, 1);
})()
