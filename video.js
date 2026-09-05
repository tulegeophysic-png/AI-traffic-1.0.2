import { 
    videoElement, canvas, ctx, inferenceCanvas, inferenceCtx, 
    isRunning, setRunning, isInferencing, setInferencing, 
    latestDetections, setLatestDetections, countsLeft, countsRight, 
    countsTotal, recentVehicles, lineConfig, getCountingLineEnabled 
} from './main.js';
import { session } from './model.js';
import { drawScene } from './counting.js';
import { updateUIStats, setStatus } from './dashboard.js';
import { suppressOverlappingDetections, calculateIoU } from './detection.js';

let lastTime = performance.now();
let frameCount = 0;
let uniqueIdCounter = 1;

export function startAI() {
    if (!videoElement.src || !session) return;
    videoElement.play().then(() => {
        setRunning(true);
        const btnStart = document.getElementById('btn-start');
        const btnStop = document.getElementById('btn-stop');
        const btnCapture = document.getElementById('btn-capture');
        if (btnStart) btnStart.disabled = true;
        if (btnStop) btnStop.disabled = false;
        if (btnCapture) btnCapture.disabled = false;
        setStatus('ready', 'RUNNING');
        requestAnimationFrame(processFrame);
    }).catch(err => {
        console.error('Không thể phát video:', err);
        stopAI();
    });
}

export function stopAI() {
    setRunning(false);
    videoElement.pause();
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');
    const btnCapture = document.getElementById('btn-capture');
    if (btnStart) btnStart.disabled = !(videoElement.src && session);
    if (btnStop) btnStop.disabled = true;
    if (btnCapture) btnCapture.disabled = true;
    setStatus('stopped', 'AI STOPPED');
}

export function captureFrame() {
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `frame-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function processFrame() {
    if (!isRunning()) return;
    if (videoElement.paused || videoElement.ended) {
        stopAI();
        return;
    }

    const now = performance.now();
    frameCount++;
    if (now - lastTime >= 1000) {
        const currentFps = (frameCount * 1000) / (now - lastTime);
        const fpsEl = document.getElementById('fps-display');
        if (fpsEl) fpsEl.innerText = currentFps.toFixed(1);
        frameCount = 0;
        lastTime = now;
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    drawScene(latestDetections);

    if (!isInferencing()) {
        setInferencing(true);
        inferenceCtx.drawImage(videoElement, 0, 0, inferenceCanvas.width, inferenceCanvas.height);
        setTimeout(async () => {
            try {
                const { preprocessWithLetterbox, parseYolov10Output } = await import('./model.js');
                const { tensor, ratio, dw, dh } = preprocessWithLetterbox(inferenceCanvas, 640);
                const results = await session.run({ [session.inputNames[0]]: tensor });
                const dets = parseYolov10Output(results[session.outputNames[0]], canvas.width, canvas.height, ratio, dw, dh);
                const filteredDets = suppressOverlappingDetections(dets);
                setLatestDetections(matchAndCountVehicles(filteredDets));
                updateUIStats();
            } catch (err) {
                console.error('Lỗi xử lý frame:', err);
                setStatus('stopped', 'AI ERROR');
                stopAI();
            } finally {
                setInferencing(false);
            }
        }, 0);
    }
    requestAnimationFrame(processFrame);
}

function matchAndCountVehicles(detections) {
    const directionMode = document.getElementById('counting-direction')?.value || 'both';
    const lineY = lineConfig.positionRatio * canvas.height;
    const nowTime = Date.now();

    for (let [id, val] of recentVehicles.entries()) {
        if (nowTime - val.time > 8000) recentVehicles.delete(id);
    }

    const orderedDetections = [...detections].sort((a, b) => b.confidence - a.confidence);
    const candidateMatches = [];
    const maxMatchDistance = Math.max(220, Math.min(canvas.width, canvas.height) * 0.20);

    orderedDetections.forEach((det, detectionIndex) => {
        const [x, y, w, h] = det.bbox;
        const cx = x + w / 2, cy = y + h / 2;
        for (let [id, val] of recentVehicles.entries()) {
            if (val.className === det.className) {
                const elapsedSeconds = Math.min((nowTime - val.time) / 1000, 1);
                const predictedX = val.cx + (val.vx || 0) * elapsedSeconds;
                const predictedY = val.cy + (val.vy || 0) * elapsedSeconds;
                const distance = Math.hypot(cx - predictedX, cy - predictedY);
                const overlap = val.bbox ? calculateIoU(det.bbox, val.bbox) : 0;
                if (overlap >= 0.05 || distance <= maxMatchDistance) {
                    candidateMatches.push({ detectionIndex, id, score: overlap * 1000 - distance });
                }
            }
        }
    });

    candidateMatches.sort((a, b) => b.score - a.score);
    const assignedIds = new Map();
    const usedIds = new Set();
    const usedDetections = new Set();

    candidateMatches.forEach(match => {
        if (!usedIds.has(match.id) && !usedDetections.has(match.detectionIndex)) {
            assignedIds.set(match.detectionIndex, match.id);
            usedIds.add(match.id);
            usedDetections.add(match.detectionIndex);
        }
    });

    orderedDetections.forEach((det, detectionIndex) => {
        const [x, y, w, h] = det.bbox;
        const cx = x + w / 2, cy = y + h / 2;
        let assignedId = assignedIds.get(detectionIndex);

        if (!assignedId) {
            assignedId = uniqueIdCounter++;
        }

        let oldData = recentVehicles.get(assignedId);

        if (oldData && getCountingLineEnabled() && !oldData.counted) {
            let oldCy = oldData.cy;
            let crossed = false;

            if (directionMode === 'both') {
                if ((oldCy < lineY && cy >= lineY) || (oldCy > lineY && cy <= lineY)) crossed = true;
            } else if (directionMode === 'down') {
                if (oldCy < lineY && cy >= lineY) crossed = true;
            } else if (directionMode === 'up') {
                if (oldCy > lineY && cy <= lineY) crossed = true;
            }

            if (crossed) {
                oldData.counted = true;
                const isLeftSide = cx < (canvas.width / 2);
                if (isLeftSide) {
                    countsLeft[det.className]++;
                    countsLeft.total++;
                } else {
                    countsRight[det.className]++;
                    countsRight.total++;
                }
                countsTotal[det.className]++;
                countsTotal.total++;
            }
        }

        let isCounted = oldData ? oldData.counted : false;
        const elapsedSeconds = oldData ? Math.max((nowTime - oldData.time) / 1000, 0.001) : 0;
        recentVehicles.set(assignedId, {
            cx, cy,
            bbox: det.bbox,
            className: det.className,
            counted: isCounted,
            time: nowTime,
            vx: oldData ? (cx - oldData.cx) / elapsedSeconds : 0,
            vy: oldData ? (cy - oldData.cy) / elapsedSeconds : 0
        });
    });

    return orderedDetections;
}