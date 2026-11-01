export async function onRequest(context) {
  const url = new URL(context.request.url);
  const id = context.params.id;

  const dataRes = await context.env.ASSETS.fetch(new URL('/data/memes.json', url.origin));
  const data = await dataRes.json();
  const memes = data.memes || [];
  const found = memes.find(m => m.id === id);

  if (!found) {
    return new Response(JSON.stringify({ code: 404, msg: "Emote not found", data: null }), {
      status: 404,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      }
    });
  }

  return new Response(JSON.stringify({
    code: 0,
    msg: "ok",
    data: {
      ...found,
      url: new URL(found.url, url.origin).href,
      thumb_url: new URL(found.thumb_url, url.origin).href,
    }
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    }
  });
}
