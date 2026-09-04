import { loadModel, classConfidenceThresholds, session } from './model.js';
import { initChart, setStatus, updateUIStats, resetTrafficViolations } from './dashboard.js';
import { drawScene, resetLinePosition } from './counting.js';
import { resetTracking } from './tracking.js';
import { captureFrame, startAI, stopAI } from './video.js';

export const videoElement = document.getElementById('video-source');
export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d');
export const inferenceCanvas = document.createElement('canvas');
export const inferenceCtx = inferenceCanvas.getContext('2d');

export const countsLeft = { car: 0, motorcycle: 0, bus: 0, truck: 0, total: 0 };
export const countsRight = { car: 0, motorcycle: 0, bus: 0, truck: 0, total: 0 };
export const countsTotal = { car: 0, motorcycle: 0, bus: 0, truck: 0, total: 0 };
export const recentVehicles = new Map();
export const lineConfig = { positionRatio: 0.35 };
export const countLineConfig = { start: { x: 0, y: 0.35 }, end: { x: 1, y: 0.35 } };
export const sideDividerConfig = {
    start: { x: 0.5, y: 0.02 },
    end: { x: 0.5, y: 0.98 }
};
export const trafficLightConfig = { x: 0.05, y: 0.05, width: 0.08, height: 0.16 };
export const stopLineConfig = { start: { x: 0, y: 0.72 }, end: { x: 1, y: 0.72 } };
export const overlayVisibility = { countLine: true, divider: true, trafficLight: false, stopLine: false };
export let latestDetections = [];

let running = false;
let inferencing = false;
let draggingLine = false;
let dividerDragMode = null;
let dividerPreviousPoint = null;
let trafficLightDragMode = null;
let stopLineDragMode = null;
let activeOverlayMode = 'counting';
let countingLineEnabled = true;
let videoObjectUrl = null;
let calibrationTimer = null;

export const isRunning = () => running;
export const setRunning = value => { running = value; };
export const isInferencing = () => inferencing;
export const setInferencing = value => { inferencing = value; };
export const setLatestDetections = value => { latestDetections = value; };
export const getCountingLineEnabled = () => countingLineEnabled;
export const getDraggingLine = () => draggingLine;
export const getDividerDragMode = () => dividerDragMode;
export const isRedLightMode = () => activeOverlayMode === 'redLight';
export const getTrafficLightDragMode = () => trafficLightDragMode;
export const getStopLineDragMode = () => stopLineDragMode;
export const getTrafficLightConfig = () => trafficLightConfig;
export const getStopLineConfig = () => stopLineConfig;

let trafficLightState = 'unknown';
let redStartedAt = null;
export const getTrafficLightState = () => trafficLightState;
export const getRedStartedAt = () => redStartedAt;
export function setTrafficLightState(state) {
    if (state !== trafficLightState) {
        if (state === 'red') redStartedAt = Date.now();
        trafficLightState = state;
    }
}

export function resetTrafficLightState() {
    trafficLightState = 'unknown';
    redStartedAt = null;
}

setInterval(() => {
    const clockElement = document.getElementById('clock');
    if (clockElement) clockElement.innerText = new Date().toTimeString().split(' ')[0];
}, 1000);

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-start').addEventListener('click', startAI);
    document.getElementById('btn-stop').addEventListener('click', stopAI);
    document.getElementById('btn-reset').addEventListener('click', resetSystem);
    document.getElementById('btn-capture').addEventListener('click', captureFrame);
    document.getElementById('btn-toggle-line').addEventListener('click', toggleCountingLineUI);
    document.getElementById('btn-reset-line').addEventListener('click', resetLinePosition);

    setupSlider('conf-moto-slider', 'motorcycle', 'conf-moto-val');
    setupSlider('conf-car-slider', 'car', 'conf-car-val');
    setupSlider('conf-bus-slider', 'bus', 'conf-bus-val');
    setupSlider('conf-truck-slider', 'truck', 'conf-truck-val');
    setupLineDragging();
    setupVideoUpload();
    setupOverlayControls();

    initChart();
    loadModel(setStatus, () => {
        if (videoElement.src) document.getElementById('btn-start').disabled = false;
    });
});

function setupOverlayControls() {
    const host = document.querySelector('.video-container');
    if (!host) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'overlay-controls';
    toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;width:100%;box-sizing:border-box;margin-top:6px;padding:5px;background:#111b38;border:1px solid #38bdf8;border-radius:4px;';
    const controls = [
        ['countLine', 'Vạch đếm'],
        ['divider', 'Phân làn'],
        ['trafficLight', 'Vùng đèn'],
        ['stopLine', 'Vạch dừng']
    ];
    controls.forEach(([key, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.overlay = key;
        button.style.cssText = 'border:1px solid #fff;background:#111827dd;color:#fff;padding:4px 7px;border-radius:4px;font-size:10px;font-weight:bold;cursor:pointer;';
        button.addEventListener('click', () => {
            overlayVisibility[key] = !overlayVisibility[key];
            updateOverlayButtons();
            drawScene(latestDetections);
        });
        toolbar.appendChild(button);
    });
    const modes = [['counting', 'Chế độ đếm xe'], ['redLight', 'Chế độ đèn đỏ']];
    modes.forEach(([mode, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mode = mode;
        button.style.cssText = 'border:1px solid #facc15;background:#334155;color:#fff;padding:4px 7px;border-radius:4px;font-size:10px;font-weight:bold;cursor:pointer;';
        button.addEventListener('click', () => {
            if (mode === 'counting') {
                activeOverlayMode = 'counting';
                overlayVisibility.countLine = true;
                overlayVisibility.divider = true;
                overlayVisibility.trafficLight = false;
                overlayVisibility.stopLine = false;
            } else {
                activeOverlayMode = 'redLight';
                overlayVisibility.countLine = false;
                overlayVisibility.divider = false;
                overlayVisibility.trafficLight = true;
                overlayVisibility.stopLine = true;
            }
            updateModeButtons();
            updateOverlayButtons();
            drawScene(latestDetections);
        });
        toolbar.appendChild(button);
    });
    host.parentElement.insertBefore(toolbar, host.nextSibling);
    updateOverlayButtons();
    updateModeButtons();
}

function updateModeButtons() {
    document.querySelectorAll('#overlay-controls [data-mode]').forEach(button => {
        const redLightMode = activeOverlayMode === 'redLight';
        const active = button.dataset.mode === 'redLight' ? redLightMode : !redLightMode;
        button.innerText = `${active ? 'ON' : 'OFF'} ${button.dataset.mode === 'redLight' ? 'Chế độ đèn đỏ' : 'Chế độ đếm xe'}`;
        button.style.background = active ? '#15803d' : '#475569';
    });
}

function updateOverlayButtons() {
    document.querySelectorAll('#overlay-controls [data-overlay]').forEach(button => {
        const active = overlayVisibility[button.dataset.overlay];
        button.innerText = `${active ? 'ON' : 'OFF'} ${button.dataset.overlay === 'countLine' ? 'Vạch đếm' : button.dataset.overlay === 'trafficLight' ? 'Vùng đèn' : button.dataset.overlay === 'stopLine' ? 'Vạch dừng' : 'Phân làn'}`;
        button.style.background = active ? '#15803d' : '#475569';
    });
}

function setupSlider(sliderId, vehicleKey, valueSpanId) {
    const slider = document.getElementById(sliderId);
    const valueSpan = document.getElementById(valueSpanId);
    if (slider && valueSpan) {
        slider.value = classConfidenceThresholds[vehicleKey];
        valueSpan.innerText = classConfidenceThresholds[vehicleKey].toFixed(2);
        slider.addEventListener('input', event => {
            const value = parseFloat(event.target.value);
            classConfidenceThresholds[vehicleKey] = value;
            valueSpan.innerText = value.toFixed(2);
        });
    }
}

function toggleCountingLineUI() {
    countingLineEnabled = !countingLineEnabled;
    const button = document.getElementById('btn-toggle-line');
    button.className = countingLineEnabled ? 'btn btn-success' : 'btn btn-danger';
    button.innerText = countingLineEnabled ? 'Vạch: ON' : 'Vạch: OFF';
    drawScene(latestDetections);
}

function setupLineDragging() {
    canvas.addEventListener('pointerdown', event => {
        const rect = canvas.getBoundingClientRect();
        const scaleY = canvas.height / rect.height;
        const scaleX = canvas.width / rect.width;
        const mouseY = (event.clientY - rect.top) * scaleY;
        const mouseX = (event.clientX - rect.left) * scaleX;
        const dividerPoint = getDividerPointAtY(mouseY);
        const startPoint = getDividerScreenPoint(sideDividerConfig.start);
        const endPoint = getDividerScreenPoint(sideDividerConfig.end);
        const trafficLightPoint = getCanvasPoint(event);
        const trafficLightBounds = {
            left: trafficLightConfig.x * canvas.width,
            top: trafficLightConfig.y * canvas.height,
            right: (trafficLightConfig.x + trafficLightConfig.width) * canvas.width,
            bottom: (trafficLightConfig.y + trafficLightConfig.height) * canvas.height
        };
        const stopStart = getDividerScreenPoint(stopLineConfig.start);
        const stopEnd = getDividerScreenPoint(stopLineConfig.end);
        if (overlayVisibility.trafficLight && trafficLightPoint.x >= trafficLightBounds.left && trafficLightPoint.x <= trafficLightBounds.right && trafficLightPoint.y >= trafficLightBounds.top && trafficLightPoint.y <= trafficLightBounds.bottom) {
            trafficLightDragMode = 'roi';
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        if (overlayVisibility.stopLine && distance(trafficLightPoint.x, trafficLightPoint.y, stopStart.x, stopStart.y) < 35) {
            stopLineDragMode = 'start';
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        if (overlayVisibility.stopLine && distance(trafficLightPoint.x, trafficLightPoint.y, stopEnd.x, stopEnd.y) < 35) {
            stopLineDragMode = 'end';
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        if (overlayVisibility.stopLine && distanceToSegment(trafficLightPoint.x, trafficLightPoint.y, stopStart.x, stopStart.y, stopEnd.x, stopEnd.y) < 28) {
            stopLineDragMode = 'line';
            canvas.setPointerCapture(event.pointerId);
            return;
        }

        const countStart = getCanvasLinePoint(countLineConfig.start);
        const countEnd = getCanvasLinePoint(countLineConfig.end);
        if (overlayVisibility.divider && distance(mouseX, mouseY, startPoint.x, startPoint.y) < 35) {
            dividerDragMode = 'start';
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        if (overlayVisibility.divider && distance(mouseX, mouseY, endPoint.x, endPoint.y) < 35) {
            dividerDragMode = 'end';
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        if (overlayVisibility.divider && distance(mouseX, mouseY, dividerPoint.x, dividerPoint.y) < 28) {
            dividerDragMode = 'line';
            dividerPreviousPoint = { x: mouseX / canvas.width, y: mouseY / canvas.height };
            canvas.setPointerCapture(event.pointerId);
            return;
        }

        if (overlayVisibility.countLine && distance(mouseX, mouseY, countStart.x, countStart.y) < 35) { draggingLine = 'countLine'; canvas.setPointerCapture(event.pointerId); return; }
        if (overlayVisibility.countLine && distance(mouseX, mouseY, countEnd.x, countEnd.y) < 35) { draggingLine = 'countLine'; canvas.setPointerCapture(event.pointerId); return; }

        if (!countingLineEnabled) return;
        const lineY = canvas.height * lineConfig.positionRatio;
        if (Math.abs(mouseY - lineY) < 40 && overlayVisibility.countLine) {
            draggingLine = 'countLine';
            canvas.setPointerCapture(event.pointerId);
        }
    });

    window.addEventListener('pointermove', event => {
        if (trafficLightDragMode || stopLineDragMode) {
            const point = getCanvasPoint(event);
            if (trafficLightDragMode === 'roi') {
                const nextX = Math.max(0, Math.min(1 - trafficLightConfig.width, point.x / canvas.width - trafficLightConfig.width / 2));
                const nextY = Math.max(0, Math.min(1 - trafficLightConfig.height, point.y / canvas.height - trafficLightConfig.height / 2));
                trafficLightConfig.x = nextX;
                trafficLightConfig.y = nextY;
            } else if (stopLineDragMode === 'start') {
                stopLineConfig.start = { x: 0, y: Math.max(0, Math.min(1, point.y / canvas.height)) };
            } else if (stopLineDragMode === 'end') {
                stopLineConfig.end = { x: 1, y: Math.max(0, Math.min(1, point.y / canvas.height)) };
            } else if (stopLineDragMode === 'line') {
                const lineY = Math.max(0, Math.min(1, point.y / canvas.height));
                const deltaY = lineY - ((stopLineConfig.start.y + stopLineConfig.end.y) / 2);
                stopLineConfig.start.y = Math.max(0, Math.min(1, stopLineConfig.start.y + deltaY));
                stopLineConfig.end.y = Math.max(0, Math.min(1, stopLineConfig.end.y + deltaY));
            }
            drawScene(latestDetections);
            return;
        }
        if (dividerDragMode) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const point = {
                x: Math.max(0, Math.min(1, ((event.clientX - rect.left) * scaleX) / canvas.width)),
                y: Math.max(0, Math.min(1, ((event.clientY - rect.top) * scaleY) / canvas.height))
            };
            if (dividerDragMode === 'start') sideDividerConfig.start = point;
            if (dividerDragMode === 'end') sideDividerConfig.end = point;
            if (dividerDragMode === 'line') {
                const deltaX = point.x - dividerPreviousPoint.x;
                const deltaY = point.y - dividerPreviousPoint.y;
                sideDividerConfig.start.x = Math.max(0, Math.min(1, sideDividerConfig.start.x + deltaX));
                sideDividerConfig.end.x = Math.max(0, Math.min(1, sideDividerConfig.end.x + deltaX));
                sideDividerConfig.start.y = Math.max(0, Math.min(1, sideDividerConfig.start.y + deltaY));
                sideDividerConfig.end.y = Math.max(0, Math.min(1, sideDividerConfig.end.y + deltaY));
                dividerPreviousPoint = point;
            }
            drawScene(latestDetections);
            return;
        }
        if (!draggingLine || !countingLineEnabled) return;
        const rect = canvas.getBoundingClientRect();
        const point = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
        if (draggingLine === 'countLine') {
            const lineY = Math.max(0, Math.min(1, point.y));
            countLineConfig.start = { x: 0, y: lineY };
            countLineConfig.end = { x: 1, y: lineY };
        }
        lineConfig.positionRatio = (countLineConfig.start.y + countLineConfig.end.y) / 2;
        drawScene(latestDetections);
    });
    window.addEventListener('pointerup', () => { draggingLine = false; dividerDragMode = null; trafficLightDragMode = null; stopLineDragMode = null; dividerPreviousPoint = null; });
    window.addEventListener('pointercancel', () => { draggingLine = false; dividerDragMode = null; trafficLightDragMode = null; stopLineDragMode = null; dividerPreviousPoint = null; });
}

function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
}

function getDividerScreenPoint(point) {
    return { x: point.x * canvas.width, y: point.y * canvas.height };
}

function getCanvasLinePoint(point) { return { x: point.x * canvas.width, y: point.y * canvas.height }; }

function getDividerPointAtY(y) {
    const start = getDividerScreenPoint(sideDividerConfig.start);
    const end = getDividerScreenPoint(sideDividerConfig.end);
    const ratio = end.y === start.y ? 0 : (y - start.y) / (end.y - start.y);
    return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
}

function distance(firstX, firstY, secondX, secondY) {
    return Math.hypot(firstX - secondX, firstY - secondY);
}

function distanceToSegment(pointX, pointY, startX, startY, endX, endY) {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const ratio = lengthSquared ? Math.max(0, Math.min(1, ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / lengthSquared)) : 0;
    return distance(pointX, pointY, startX + ratio * deltaX, startY + ratio * deltaY);
}

export function getDividerXAtY(y) {
    return getDividerPointAtY(y).x;
}

export function isLeftOfDivider(x, y) {
    return x < getDividerXAtY(y);
}

export function getStopLineSide(x, y) {
    const startX = stopLineConfig.start.x * canvas.width;
    const startY = stopLineConfig.start.y * canvas.height;
    const endX = stopLineConfig.end.x * canvas.width;
    const endY = stopLineConfig.end.y * canvas.height;
    const crossProduct = (endX - startX) * (y - startY) - (endY - startY) * (x - startX);
    return crossProduct >= 0 ? 1 : -1;
}

export function getCountLineSide(x, y) {
    const startX = countLineConfig.start.x * canvas.width, startY = countLineConfig.start.y * canvas.height;
    const endX = countLineConfig.end.x * canvas.width, endY = countLineConfig.end.y * canvas.height;
    return (endX - startX) * (y - startY) - (endY - startY) * (x - startX) >= 0 ? 1 : -1;
}

function setupVideoUpload() {
    const uploadInput = document.getElementById('upload-video');
    if (!uploadInput) return;
    uploadInput.addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        if (running) stopAI();
        resetSystemDataOnly();
        if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
        videoObjectUrl = URL.createObjectURL(file);
        videoElement.src = videoObjectUrl;
        videoElement.load();
        videoElement.onloadedmetadata = () => {
            videoElement.pause();
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            inferenceCanvas.width = canvas.width;
            inferenceCanvas.height = canvas.height;
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            drawScene([]);
            showCalibrationPreview();
            if (session) {
                document.getElementById('btn-start').disabled = false;
                setStatus('ready', 'AI READY');
            }
        };
    });
}

function showCalibrationPreview() {
    if (calibrationTimer) clearInterval(calibrationTimer);
    const host = document.querySelector('.video-container');
    if (!host) return;
    let notice = document.getElementById('calibration-preview');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'calibration-preview';
        notice.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:6;padding:6px 10px;background:#0f172add;border:1px solid #facc15;border-radius:4px;color:#fff;font-size:11px;font-weight:bold;text-align:center;pointer-events:none;';
        host.appendChild(notice);
    }
    const endTime = Date.now() + 3000;
    const updateNotice = () => {
        const remaining = Math.max(0, endTime - Date.now());
        notice.innerText = `TẠM DỪNG - ĐIỀU CHỈNH VẠCH (${Math.ceil(remaining / 1000)}s)`;
        if (remaining <= 0) {
            clearInterval(calibrationTimer);
            calibrationTimer = null;
            notice.remove();
        }
    };
    updateNotice();
    calibrationTimer = setInterval(updateNotice, 100);
}

function resetSystemDataOnly() {
    [countsLeft, countsRight, countsTotal].forEach(counts => {
        counts.car = 0;
        counts.motorcycle = 0;
        counts.bus = 0;
        counts.truck = 0;
        counts.total = 0;
    });
    resetTracking();
    resetTrafficLightState();
    resetTrafficViolations();
    setLatestDetections([]);
    updateUIStats();
}

function resetSystem() {
    stopAI();
    resetSystemDataOnly();
    resetLinePosition();
    if (videoElement && videoElement.src) {
        videoElement.currentTime = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        drawScene([]);
    }
}

window.addEventListener('beforeunload', () => {
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
});
