export async function onRequest(context) {
  const url = new URL(context.request.url);
  const res = await context.env.ASSETS.fetch(new URL('/data/series.json', url.origin));
  const data = await res.json();
  return new Response(JSON.stringify({ code: 0, msg: "ok", data: data.series || [] }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    }
  });
}
