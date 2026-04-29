/**
 * 谷歌翻译 TTS 代理
 * GET /api/tts/google?q=xxx&tl=id
 * 服务端转发请求，绕过浏览器 CORS 限制
 * 注意：不走共享路由表，直接处理请求
 */

export async function onRequest(context) {
    // 处理 CORS 预检
    if (context.request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }

    const url = new URL(context.request.url);
    const text = url.searchParams.get('q') || '';
    const lang = url.searchParams.get('tl') || 'id';

    if (!text || text.length > 200) {
        return new Response('参数无效', { status: 400, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } });
    }

    // 优先尝试 googleapis 端点，回退 google 端点
    const endpoints = [
        `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=gtx`,
        `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=atelier`
    ];

    for (const ttsUrl of endpoints) {
        try {
            const resp = await fetch(ttsUrl);
            if (resp.ok) {
                const audioBlob = await resp.arrayBuffer();
                return new Response(audioBlob, {
                    status: 200,
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'Cache-Control': 'public, max-age=86400',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        } catch (e) {
            console.error('TTS endpoint failed:', e.message);
        }
    }

    return new Response('TTS 获取失败', { status: 502, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } });
}
