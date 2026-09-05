import { startAI, stopAI, captureFrame } from './video.js';
import { initModel, session } from './model.js';

// --- BIẾN TOÀN CỤC & TRẠNG THÁI ---
export let videoElement = null;
export let canvas = null;
export let ctx = null;
export let inferenceCanvas = null;
export let inferenceCtx = null;

let _running = false;
let _inferencing = false;
export let latestDetections = [];

export const countsLeft = { car: 0, motorcycle: 0, bus: 0, truck: 0, total: 0 };
export const countsRight = { car: 0, motorcycle: 0, bus: 0, truck: 0, total: 0 };
export const countsTotal = { car: 0, motorcycle: 0, bus: 0, truck: 0, total: 0 };
export const recentVehicles = new Map();

export const lineConfig = {
    positionRatio: 0.55, // Vị trí vạch đếm (55% chiều cao khung hình)
    isDragging: false
};

let countingLineEnabled = true;

// Các hàm getter/setter trạng thái an toàn cho module khác gọi
export function isRunning() { return _running; }
export function setRunning(val) { _running = val; }

export function isInferencing() { return _inferencing; }
export function setInferencing(val) { _inferencing = val; }

export function setLatestDetections(dets) { latestDetections = dets; }
export function getCountingLineEnabled() { return countingLineEnabled; }

// --- KHỞI TẠO ỨNG DỤNG KHI TẢI TRANG ---
window.addEventListener('DOMContentLoaded', () => {
    videoElement = document.getElementById('input-video');
    canvas = document.getElementById('output-canvas');
    if (canvas) ctx = canvas.getContext('2d');

    // Tạo canvas ẩn phục vụ cho việc trích xuất tensor đưa vào mô hình AI
    inferenceCanvas = document.createElement('canvas');
    inferenceCanvas.width = 640;
    inferenceCanvas.height = 640;
    inferenceCtx = inferenceCanvas.getContext('2d');

    setupDashboardTools();
    bindEvents();
    initModel();
});

// --- THIẾT LẬP DASHBOARD (ĐÃ CHẶN LẬP NÚT) ---
function setupDashboardTools() {
    // Ngăn chặn việc tạo lặp lại thanh công cụ nếu hàm bị gọi nhiều lần
    if (document.getElementById('dashboard-tools')) return;

    const header = document.querySelector('header');
    if (!header) return;

    const tools = document.createElement('div');
    tools.id = 'dashboard-tools';
    tools.style.cssText = 'width:100%;max-width:1300px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 auto 8px;padding:8px 12px;background:#111b38;border:1px solid #1e293b;border-radius:6px;font-size:12px;color:#fff;';

    tools.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;">
            <label for="counting-direction" style="font-weight:600;">Chiều đếm:</label>
            <select id="counting-direction" style="background:#0f172a;color:#fff;border:1px solid #334155;padding:3px 6px;border-radius:4px;">
                <option value="both">Cả hai chiều (Both)</option>
                <option value="down">Chiều xuống (Down)</option>
                <option value="up">Chiều lên (Up)</option>
            </select>
        </div>
        <div style="display:flex;align-items:center;gap:5px;">
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                <input type="checkbox" id="toggle-line" checked style="cursor:pointer;"> Hiển thị vạch đếm
            </label>
        </div>
        <div style="display:flex;align-items:center;gap:5px;margin-left:auto;">
            <span id="fps-display" style="background:#0f172a;padding:2px 6px;border-radius:4px;font-family:monospace;border:1px solid #334155;">0.0</span> FPS
        </div>
    `;

    header.parentNode.insertBefore(tools, header.nextSibling);

    // Lắng nghe sự kiện bật/tắt vạch đếm từ checkbox vừa tạo
    const toggleLineCheckbox = document.getElementById('toggle-line');
    if (toggleLineCheckbox) {
        toggleLineCheckbox.addEventListener('change', (e) => {
            countingLineEnabled = e.target.checked;
        });
    }
}

// --- LIÊN KẾT SỰ KIỆN NÚT BẤM GIAO DIỆN ---
function bindEvents() {
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');
    const btnCapture = document.getElementById('btn-capture');
    const fileInput = document.getElementById('video-file-input');

    if (btnStart) btnStart.addEventListener('click', startAI);
    if (btnStop) btnStop.addEventListener('click', stopAI);
    if (btnCapture) btnCapture.addEventListener('click', captureFrame);

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const fileURL = URL.createObjectURL(file);
                videoElement.src = fileURL;
                videoElement.load();
                
                videoElement.onloadedmetadata = () => {
                    // Thiết lập kích thước canvas khớp với video thực tế
                    canvas.width = videoElement.videoWidth;
                    canvas.height = videoElement.videoHeight;
                    
                    if (btnStart) btnStart.disabled = !session;
                    const statusEl = document.getElementById('status-text');
                    if (statusEl) {
                        statusEl.innerText = 'Sẵn sàng chạy AI';
                        statusEl.className = 'status-ready';
                    }
                };
            }
        });
    }
}