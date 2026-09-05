import { session } from './model.js';
import { preprocessWithLetterbox, parseYolov10Output } from './model.js';
import { canvas, ctx, inferenceCanvas, inferenceCtx, latestDetections, setLatestDetections, isInferencing, setInferencing, isRunning, setRunning } from './main.js';
import { matchAndCountVehicles } from './tracking.js';
import { drawScene, updateTrafficLightState } from './counting.js';
import { updateUIStats, setStatus } from './dashboard.js';

export function processFrame() {
    if (!isRunning()) return;
    if (videoElement.paused || videoElement.ended) {
        stopAI();
        return;
    }

    const now = performance.now();
    updateFps(now);
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    inferenceCtx.drawImage(videoElement, 0, 0, inferenceCanvas.width, inferenceCanvas.height);
    updateTrafficLightState();
    drawScene(latestDetections);

    if (!isInferencing()) {
        setInferencing(true);
        inferenceCtx.drawImage(videoElement, 0, 0, inferenceCanvas.width, inferenceCanvas.height);
        setTimeout(async () => {
            try {
                const { tensor, ratio, dw, dh } = preprocessWithLetterbox(inferenceCanvas, 640);
                const results = await session.run({ [session.inputNames[0]]: tensor });
                const detections = parseYolov10Output(results[session.outputNames[0]], canvas.width, canvas.height, ratio, dw, dh);
                setLatestDetections(matchAndCountVehicles(detections));
                updateUIStats();
            } catch (error) {
                console.error('Lỗi xử lý frame:', error);
                setStatus('stopped', 'AI ERROR');
                stopAI();
            } finally {
                setInferencing(false);
            }
        }, 0);
    }
    requestAnimationFrame(processFrame);
}

export async function startAI() {
    if (!videoElement.src) {
        setStatus('stopped', 'CHƯA CHỌN VIDEO');
        return;
    }
    if (!session) {
        setStatus('stopped', 'MODEL CHƯA SẴN SÀNG');
        return;
    }
    try {
        await videoElement.play();
    } catch (error) {
        console.error('Không thể phát video:', error);
        stopAI();
        return;
    }
    setRunning(true);
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    document.getElementById('btn-capture').disabled = false;
    setStatus('ready', 'RUNNING');
    requestAnimationFrame(processFrame);
}

export function stopAI() {
    setRunning(false);
    videoElement.pause();
    document.getElementById('btn-start').disabled = !(videoElement.src && session);
    document.getElementById('btn-stop').disabled = true;
    document.getElementById('btn-capture').disabled = true;
    setStatus('stopped', 'AI STOPPED');
}

export function captureFrame() {
    const link = document.createElement('a');
    link.download = `capture-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function updateFps(now) {
    const state = getFpsState();
    state.frameCount++;
    if (now - state.lastTime >= 1000) {
        state.currentFps = (state.frameCount * 1000) / (now - state.lastTime);
        document.getElementById('fps-display').innerText = state.currentFps.toFixed(1);
        state.frameCount = 0;
        state.lastTime = now;
    }
}

function getFpsState() {
    if (!window.__trafficFpsState) {
        window.__trafficFpsState = { lastTime: performance.now(), frameCount: 0, currentFps: 0 };
    }
    return window.__trafficFpsState;
}

const videoElement = document.getElementById('video-source');
