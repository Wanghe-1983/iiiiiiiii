/**
 * 谷歌翻译 TTS 代理（支持 WSOLA 时间拉伸）
 * GET /api/tts/google?q=xxx&tl=id&speed=0.8
 *
 * speed 参数：
 *   - 1.0（默认）：原始速度，直接透传
 *   - 0.3~0.99：减速（WSOLA 拉伸）
 *   - 1.01~3.0：加速（WSOLA 压缩）
 *
 * 缓存策略：
 *   - speed=1.0 的原始音频：KV 缓存 7 天
 *   - speed!=1.0 的处理音频：KV 缓存 7 天
 */

import { wsolaStretch, encodeWAV } from './wsola.js';
import { decodeMp3ToPCM } from './mp3-decode.js';

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
    const speed = parseFloat(url.searchParams.get('speed') || '1.0');

    if (!text || text.length > 200) {
        return new Response('参数无效', {
            status: 400,
            headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
        });
    }

    // 规范化 speed
    const normSpeed = Math.round(speed * 100) / 100;

    // KV 缓存 key
    const cacheKey = `tts:${lang}:${normSpeed}:${text}`;
    const kv = context.env.INDO_LEARN_KV;

    // 检查 KV 缓存
    try {
        if (kv) {
            const cached = await kv.get(cacheKey, { type: 'arrayBuffer' });
            if (cached) {
                return new Response(cached, {
                    status: 200,
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'Cache-Control': 'public, max-age=604800',
                        'Access-Control-Allow-Origin': '*',
                        'X-TTS-Cache': 'HIT',
                        'X-TTS-Speed': String(normSpeed)
                    }
                });
            }
        }
    } catch (e) {
        // KV 不可用时继续正常流程
    }

    // 从谷歌获取原始 MP3（始终用 speed=1 获取原始音频）
    const endpoints = [
        `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=gtx`,
        `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=atelier`
    ];

    let originalAudio = null;
    for (const ttsUrl of endpoints) {
        try {
            const resp = await fetch(ttsUrl);
            if (resp.ok) {
                originalAudio = await resp.arrayBuffer();
                break;
            }
        } catch (e) {
            console.error('TTS endpoint failed:', e.message);
        }
    }

    if (!originalAudio) {
        return new Response('TTS 获取失败', {
            status: 502,
            headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
        });
    }

    // 如果 speed=1.0，直接返回原始音频（经过 WSOLA 处理是不必要的）
    if (Math.abs(normSpeed - 1.0) < 0.01) {
        // 缓存原始音频到 KV
        try {
            if (kv) {
                await kv.put(cacheKey, originalAudio, { expirationTtl: 604800 });
            }
        } catch (e) {}

        return new Response(originalAudio, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*',
                'X-TTS-Cache': 'MISS',
                'X-TTS-Speed': '1.0'
            }
        });
    }

    // speed != 1.0：尝试 WSOLA 时间拉伸
    try {
        const decoded = await decodeMp3ToPCM(originalAudio);

        if (decoded.samples && decoded.samples.length > 0) {
            // 成功解码为 PCM，执行 WSOLA
            const stretched = wsolaStretch(decoded.samples, decoded.sampleRate, normSpeed);

            // 重新编码为 MP3
            // 在 Workers 中使用简化的 PCM→MP3 编码
            // 由于 lamejs 较大，我们使用 WAV 格式作为回退
            // 并设置适当的 MIME 类型
            const wavBuffer = encodeWAV(stretched, decoded.sampleRate);

            // 缓存处理后的音频
            try {
                if (kv) {
                    await kv.put(cacheKey, wavBuffer, { expirationTtl: 604800 });
                }
            } catch (e) {}

            return new Response(wavBuffer, {
                status: 200,
                headers: {
                    'Content-Type': 'audio/wav',
                    'Cache-Control': 'public, max-age=604800',
                    'Access-Control-Allow-Origin': '*',
                    'X-TTS-Cache': 'MISS',
                    'X-TTS-Speed': String(normSpeed),
                    'X-TTS-Method': 'wsola'
                }
            });
        }
    } catch (e) {
        console.error('WSOLA processing failed:', e.message);
    }

    // WSOLA 处理失败，回退：返回原始音频 + 前端用 playbackRate
    // 缓存原始音频
    try {
        if (kv) {
            const fallbackKey = `tts:${lang}:1.0:${text}`;
            await kv.put(fallbackKey, originalAudio, { expirationTtl: 604800 });
        }
    } catch (e) {}

    return new Response(originalAudio, {
        status: 200,
        headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
            'X-TTS-Cache': 'MISS',
            'X-TTS-Speed': String(normSpeed),
            'X-TTS-Method': 'fallback-pcm'  // 前端检测到此header应使用playbackRate
        }
    });
}
