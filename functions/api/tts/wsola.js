/**
 * WSOLA (Waveform Similarity Overlap-Add) 时间拉伸算法
 * 保持音高不变，仅改变音频时长
 *
 * 适用环境: Cloudflare Workers (无 AudioContext，纯数学运算)
 * 输入: PCM Float32Array (单声道, 16kHz)
 * 输出: 拉伸后的 PCM Float32Array
 */

/**
 * 归一化互相关 (NCC) - 在搜索窗口中找最佳匹配位置
 * @param {Float32Array} buffer - 完整音频缓冲
 * @param {number} targetPos - 目标拼接位置
 * @param {number} searchStart - 搜索窗口起始
 * @param {number} searchEnd - 搜索窗口结束
 * @param {number} analysisLen - 分析帧长度（样本数）
 * @returns {{ position: number, ncc: number }} 最佳匹配位置和相似度
 */
function findBestMatchNCC(buffer, targetPos, searchStart, searchEnd, analysisLen) {
    const bufLen = buffer.length;
    let bestPos = targetPos;
    let bestNCC = -Infinity;

    // 确保不越界
    const tStart = Math.max(0, targetPos);
    const tEnd = Math.min(bufLen, targetPos + analysisLen);
    const actualTLen = tEnd - tStart;
    if (actualTLen <= 0) return { position: targetPos, ncc: 0 };

    // 计算 target 帧的均值和标准差（用于归一化）
    let tSum = 0;
    for (let i = tStart; i < tEnd; i++) tSum += buffer[i];
    const tMean = tSum / actualTLen;

    let tVarSum = 0;
    for (let i = tStart; i < tEnd; i++) {
        const d = buffer[i] - tMean;
        tVarSum += d * d;
    }
    const tStd = Math.sqrt(Math.max(1e-10, tVarSum));

    // 在搜索窗口中寻找最佳匹配
    const sStart = Math.max(0, searchStart);
    const sEnd = Math.min(bufLen - analysisLen, searchEnd);

    for (let s = sStart; s <= sEnd; s++) {
        let crossSum = 0;
        let sSum = 0;
        for (let i = 0; i < analysisLen; i++) {
            crossSum += (buffer[tStart + i] - tMean) * (buffer[s + i] - tMean);
            sSum += buffer[s + i];
        }

        const sMean = sSum / analysisLen;
        let sVarSum = 0;
        for (let i = 0; i < analysisLen; i++) {
            const d = buffer[s + i] - sMean;
            sVarSum += d * d;
        }
        const sStd = Math.sqrt(Math.max(1e-10, sVarSum));

        const ncc = crossSum / (tStd * sStd * analysisLen);
        if (ncc > bestNCC) {
            bestNCC = ncc;
            bestPos = s;
        }
    }

    return { position: bestPos, ncc: bestNCC };
}

/**
 * 生成 Hann 窗
 * @param {number} length - 窗长度
 * @returns {Float32Array} 窗函数
 */
function hannWindow(length) {
    const win = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
    }
    return win;
}

/**
 * WSOLA 时间拉伸核心函数
 *
 * @param {Float32Array} input - 输入 PCM 数据（单声道）
 * @param {number} sampleRate - 采样率（Hz）
 * @param {number} speed - 目标速率 (< 1.0 放慢, > 1.0 加速)
 * @returns {Float32Array} 拉伸后的 PCM 数据
 */
export function wsolaStretch(input, sampleRate, speed) {
    if (!input || input.length < 100) return input;

    // 速度边界保护
    speed = Math.max(0.3, Math.min(3.0, speed));
    if (Math.abs(speed - 1.0) < 0.01) return new Float32Array(input);

    const inputLen = input.length;

    // WSOLA 参数
    const analysisFramesPerSecond = 50; // 每秒分析帧数
    const analysisFrameLen = Math.round(sampleRate / analysisFramesPerSecond);
    const overlapLen = Math.round(analysisFrameLen * 0.5); // 50% 重叠
    const fadeLen = overlapLen; // 交叉淡入淡出长度
    const searchRangeMs = 30; // 搜索窗口 ±30ms
    const searchRange = Math.round(sampleRate * searchRangeMs / 1000);

    // 预计算 Hann 窗
    const fadeWindow = hannWindow(fadeLen);

    // 计算输出长度
    const outputLen = Math.round(inputLen / speed);
    const output = new Float32Array(outputLen);

    // WSOLA 帧步长（输入侧和输出侧）
    const inputStep = Math.round(analysisFrameLen * (speed > 1.0 ? 1.0 : speed));
    const outputStep = Math.round(analysisFrameLen * (speed > 1.0 ? speed : 1.0));

    let inputPos = 0;  // 输入缓冲读取位置
    let outputPos = 0; // 输出缓冲写入位置

    // 主循环：逐帧处理
    while (outputPos < outputLen - overlapLen && inputPos < inputLen - analysisFrameLen) {
        // 搜索窗口：在 inputPos 周围
        const searchStart = Math.max(0, inputPos - searchRange);
        const searchEnd = Math.min(inputLen - analysisFrameLen, inputPos + searchRange);

        // 目标输出位置（用于与输入帧匹配）
        const targetOutputPos = outputPos;

        // 找到输入缓冲中与目标输出最相似的帧
        const match = findBestMatchNCC(
            input,
            targetOutputPos,  // 理想位置（时间拉伸映射后的位置）
            searchStart,
            searchEnd,
            analysisFrameLen
        );

        const bestInputPos = match.position;

        // 确保 write 位置在输出缓冲范围内
        if (outputPos + analysisFrameLen > outputLen) break;

        // OLA 合成：重叠区域做交叉淡入淡出
        if (outputPos > 0 && outputPos < outputLen) {
            const crossfadeLen = Math.min(fadeLen, outputPos, outputLen - outputPos);
            const readOffset = outputPos - overlapLen;

            for (let i = 0; i < crossfadeLen; i++) {
                const outIdx = outputPos - overlapLen + i;
                const inIdx = bestInputPos + i;
                if (outIdx >= 0 && outIdx < outputLen && inIdx < inputLen) {
                    // 交叉淡入淡出：旧数据淡出，新数据淡入
                    const oldWeight = fadeWindow[crossfadeLen - 1 - i];
                    const newWeight = fadeWindow[i];
                    output[outIdx] = output[outIdx] * oldWeight + input[inIdx] * newWeight;
                }
            }

            // 非重叠部分直接写入
            const nonOverlapStart = outputPos - overlapLen + crossfadeLen;
            const nonOverlapEnd = Math.min(bestInputPos + analysisFrameLen, inputLen);
            const writeEnd = Math.min(nonOverlapStart + (nonOverlapEnd - bestInputPos - crossfadeLen), outputLen);

            for (let i = nonOverlapStart; i < writeEnd; i++) {
                const srcIdx = bestInputPos + crossfadeLen + (i - nonOverlapStart);
                if (srcIdx < inputLen && i < outputLen) {
                    output[i] = input[srcIdx];
                }
            }
        } else {
            // 第一帧直接写入
            const copyLen = Math.min(analysisFrameLen, outputLen - outputPos);
            for (let i = 0; i < copyLen; i++) {
                if (bestInputPos + i < inputLen) {
                    output[outputPos + i] = input[bestInputPos + i];
                }
            }
        }

        // 前进
        inputPos += inputStep;
        outputPos += outputStep;
    }

    return output;
}

/**
 * 简单的 WAV 编码器（用于调试/测试）
 * 在 Workers 中不使用，仅用于 Node.js 本地测试
 */
export function encodeWAV(samples, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = samples.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return buffer;
}
