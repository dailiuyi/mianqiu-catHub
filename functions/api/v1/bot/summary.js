export async function onRequest(context) {
  const url = new URL(context.request.url);
  const dataRes = await context.env.ASSETS.fetch(new URL('/data/memes.json', url.origin));
  const seriesRes = await context.env.ASSETS.fetch(new URL('/data/series.json', url.origin));
  const tagsRes = await context.env.ASSETS.fetch(new URL('/data/tags.json', url.origin));

  const data = await dataRes.json();
  const seriesData = await seriesRes.json();
  const tagsData = await tagsRes.json();

  const memes = data.memes || [];
  const animatedCnt = memes.filter(x => x.is_animated).length;

  return new Response(JSON.stringify({
    code: 0,
    msg: "ok",
    data: {
      author: "쯔니 (zzni)",
      series_name: "몽실몽실 냥냥이 (棉球小猫)",
      total_emotes: memes.length,
      animated_count: animatedCnt,
      static_count: memes.length - animatedCnt,
      series_count: (seriesData.series || []).length,
      tags_count: (tagsData.tags || []).length,
    }
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    }
  });
}
