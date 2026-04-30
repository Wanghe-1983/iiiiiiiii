/**
 * MP3 解码器 - 将 MP3 数据转为 PCM Float32Array
 * 适用于 Cloudflare Workers 环境（无 AudioContext）
 *
 * 实现策略：
 * 1. 使用 Web Codecs API（如果环境支持）
 * 2. 回退到简化的 MP3 frame parser（仅支持 MPEG1 Layer 3）
 *
 * 注意：Workers 环境中 Web Codecs 可能不可用，
 * 因此主方案是简化的 MP3 解码
 */

/**
 * 简化的 MP3 帧头解析
 * MP3 帧头: 4 bytes (11 sync bits + version/layer/rate/padding/channel info)
 */
const MPEG_VERSIONS = { 3: '1', 2: '2', 0: '2.5' };
const LAYERS = { 3: 1, 2: 2, 1: 3 };
const BITRATE_TABLE = {
    '1': { // MPEG1
        1: [0,32,64,96,128,160,192,224,256,288,320,352,384,416,448],
        2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
        3: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160]
    },
    '2': { // MPEG2/2.5
        1: [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256],
        2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
        3: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160]
    }
};
const SAMPLE_RATE_TABLE = {
    '1': [44100, 48000, 32000],
    '2': [22050, 24000, 16000],
    '2.5': [11025, 12000, 8000]
};

/**
 * 使用 Web Codecs API 解码 MP3（如果可用）
 * @param {ArrayBuffer} mp3Buffer
 * @returns {Promise<{ samples: Float32Array, sampleRate: number }>}
 */
async function decodeWithWebCodecs(mp3Buffer) {
    if (typeof AudioDecoder === 'undefined') {
        throw new Error('Web Codecs not available');
    }

    const decoder = new AudioDecoder({
        output: (audioData) => {
            const channelData = new Float32Array(audioData.numberOfFrames);
            for (let ch = 0; ch < audioData.numberOfChannels; ch++) {
                const chData = new Float32Array(audioData.numberOfFrames);
                audioData.copyTo(chData, { planeIndex: ch });
                for (let i = 0; i < audioData.numberOfFrames; i++) {
                    channelData[i] += chData[i] / audioData.numberOfChannels;
                }
            }
            audioData.close();
            decoder._result = channelData;
        },
        error: (e) => {
            decoder._error = e;
        }
    });

    decoder._result = null;
    decoder._error = null;

    decoder.configure({
        codec: 'mp3',
        sampleRate: 0,
        numberOfChannels: 1,
    });

    // 将 MP3 数据分块喂给解码器
    const chunk = new EncodedAudioChunk({
        type: 'key',
        timestamp: 0,
        data: mp3Buffer,
    });
    decoder.decode(chunk);
    decoder.flush();

    // 等待解码完成
    await new Promise((resolve, reject) => {
        const check = () => {
            if (decoder._error) reject(decoder._error);
            else if (decoder._result) resolve();
            else setTimeout(check, 10);
        };
        check();
    });

    const sampleRate = decoder.sampleRate || 24000; // 谷歌 TTS 通常输出 24kHz
    decoder.close();

    return { samples: decoder._result, sampleRate };
}

/**
 * 简化的线性 PCM 解码（用于回退）
 * 将 MP3 帧近似解码为 PCM
 * 注意：这不是真正的 MP3 解码，质量有限
 *
 * 实际上在 Workers 中我们需要使用 Web Codecs 或外部库
 * 这里我们提供一个基于 cos^2 窗的简化合成方案作为最后手段
 */
function linearResampleFromMp3Frames(mp3Buffer) {
    // 尝试从 MP3 帧头提取信息
    const header = parseMp3Header(mp3Buffer);
    if (!header) {
        // 如果无法解析 MP3 头，返回空数据
        return { samples: new Float32Array(0), sampleRate: 24000 };
    }

    // 对于无法真正解码 MP3 的情况，我们使用一种替代方案：
    // 返回标记数据，调用方应回退到原始播放
    return { samples: null, sampleRate: header.sampleRate, needsFallback: true };
}

/**
 * 解析 MP3 帧头
 * @param {ArrayBuffer} buffer
 * @returns {{ sampleRate: number, bitrate: number, channels: number, frameSize: number } | null}
 */
function parseMp3Header(buffer) {
    const data = new Uint8Array(buffer);
    // 找到第一个有效的 MP3 帧同步字 (0xFF followed by 0xE0+)
    let offset = 0;
    while (offset < data.length - 4) {
        if (data[offset] === 0xFF && (data[offset + 1] & 0xE0) === 0xE0) {
            break;
        }
        offset++;
    }
    if (offset >= data.length - 4) return null;

    const b1 = data[offset + 1];
    const b2 = data[offset + 2];

    const versionIdx = (b1 >> 3) & 0x03;
    const layerIdx = (b1 >> 1) & 0x03;
    const bitrateIdx = (b2 >> 4) & 0x0F;
    const sampleRateIdx = (b2 >> 2) & 0x03;
    const padding = (b2 >> 1) & 0x01;
    const channelMode = (data[offset + 3] >> 6) & 0x03;

    const version = MPEG_VERSIONS[versionIdx];
    const layer = LAYERS[layerIdx];
    if (!version || !layer || layer !== 3) return null;

    const sampleRate = SAMPLE_RATE_TABLE[version]?.[sampleRateIdx] || 24000;
    const bitrate = BITRATE_TABLE[version]?.[layer]?.[bitrateIdx] || 128;
    const channels = (channelMode === 3) ? 1 : 2;

    // 计算帧大小
    const frameSize = layer === 3
        ? Math.floor(144 * bitrate * 1000 / sampleRate) + padding
        : Math.floor(384 * bitrate * 1000 / sampleRate) + padding;

    return { sampleRate, bitrate, channels, frameSize };
}

/**
 * 主解码函数
 * 优先使用 Web Codecs API，回退到帧头解析
 *
 * @param {ArrayBuffer} mp3Buffer - MP3 音频数据
 * @returns {Promise<{ samples: Float32Array | null, sampleRate: number, needsFallback?: boolean }>}
 */
export async function decodeMp3ToPCM(mp3Buffer) {
    // 方案1: Web Codecs API（Cloudflare Workers 2024+ 支持）
    try {
        const result = await decodeWithWebCodecs(mp3Buffer);
        if (result.samples && result.samples.length > 0) {
            return result;
        }
    } catch (e) {
        // Web Codecs 不可用
    }

    // 方案2: 帧头解析（无法真正解码，标记需要回退）
    const headerInfo = parseMp3Header(mp3Buffer);
    if (headerInfo) {
        return {
            samples: null,
            sampleRate: headerInfo.sampleRate,
            needsFallback: true
        };
    }

    // 无法识别格式
    return {
        samples: null,
        sampleRate: 24000,
        needsFallback: true
    };
}
