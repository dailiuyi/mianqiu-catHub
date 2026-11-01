export async function onRequest(context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

  if (!q) {
    return new Response(JSON.stringify({ code: 0, msg: "ok", data: { total: 0, items: [] } }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      }
    });
  }

  const dataRes = await context.env.ASSETS.fetch(new URL('/data/memes.json', url.origin));
  const data = await dataRes.json();
  const memes = data.memes || [];

  const matched = memes.filter(m => {
    const title = (m.title || '').toLowerCase();
    const titleKo = (m.title_ko || '').toLowerCase();
    const ocr = (m.ocr_text || '').toLowerCase();
    const pinyin = (m.pinyin || '').toLowerCase();
    const pinyinFirst = (m.pinyin_first || '').toLowerCase();
    const tags = (m.tags || []).map(t => t.toLowerCase());

    return title.includes(q) || titleKo.includes(q) || ocr.includes(q) ||
           pinyin.includes(q) || pinyinFirst.includes(q) || tags.some(t => t.includes(q));
  });

  const paged = matched.slice(offset, offset + limit).map(m => ({
    ...m,
    url: new URL(m.url, url.origin).href,
    thumb_url: new URL(m.thumb_url, url.origin).href,
  }));

  return new Response(JSON.stringify({
    code: 0,
    msg: "ok",
    data: {
      total: matched.length,
      items: paged
    }
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    }
  });
}
