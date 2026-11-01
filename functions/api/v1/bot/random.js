export async function onRequest(context) {
  const url = new URL(context.request.url);
  const dataRes = await context.env.ASSETS.fetch(new URL('/data/memes.json', url.origin));
  const data = await dataRes.json();
  let items = data.memes || [];

  const series = url.searchParams.get("series");
  const tag = url.searchParams.get("tag");
  const animatedParam = url.searchParams.get("animated");

  if (series) {
    items = items.filter(x => (x.series || '').toLowerCase() === series.toLowerCase());
  }
  if (tag) {
    items = items.filter(x => (x.tags || []).includes(tag));
  }
  if (animatedParam !== null) {
    const isAnim = animatedParam === "true";
    items = items.filter(x => !!x.is_animated === isAnim);
  }

  if (items.length === 0) {
    return new Response(JSON.stringify({ code: 404, msg: "未找到符合过滤条件的表情", data: null }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      }
    });
  }

  const chosen = items[Math.floor(Math.random() * items.length)];
  const itemOut = {
    ...chosen,
    url: new URL(chosen.url, url.origin).href,
    thumb_url: new URL(chosen.thumb_url, url.origin).href,
  };

  return new Response(JSON.stringify({ code: 0, msg: "ok", data: itemOut }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    }
  });
}
