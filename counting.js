import { canvas, ctx, inferenceCanvas, lineConfig, countLineConfig, latestDetections, sideDividerConfig, trafficLightConfig, stopLineConfig, overlayVisibility, getCountingLineEnabled, getDraggingLine, getDividerDragMode, getTrafficLightDragMode, getStopLineDragMode, getTrafficLightState, setTrafficLightState } from './main.js';

export function drawScene(vehicles) {
    if (overlayVisibility.countLine && getCountingLineEnabled()) {
        const startX = countLineConfig.start.x * canvas.width;
        const startY = countLineConfig.start.y * canvas.height;
        const endX = countLineConfig.end.x * canvas.width;
        const endY = countLineConfig.end.y * canvas.height;
        ctx.strokeStyle = getDraggingLine() ? '#38bdf8' : '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.fillStyle = getDraggingLine() ? '#38bdf8' : '#ef4444';
        ctx.font = 'bold 13px Segoe UI';
        ctx.fillText('VẠCH ĐẾM PHƯƠNG TIỆN', Math.min(startX, endX) + 15, Math.min(startY, endY) - 8);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(startX, startY, 11, 0, Math.PI * 2);
        ctx.arc(endX, endY, 11, 0, Math.PI * 2);
        ctx.fill();
    }

    if (vehicles) {
        vehicles.forEach(vehicle => {
            const [x, y, width, height] = vehicle.bbox;
            const color = getCategoryColor(vehicle.className);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);

            ctx.fillStyle = color;
            ctx.fillRect(x, y > 18 ? y - 18 : 0, 110, 16);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px Segoe UI';
            ctx.fillText(`ID #${vehicle.id}`, x + 2, y > 18 ? y - 5 : 12);
        });
    }

    if (overlayVisibility.divider) drawSideDivider();
    if (overlayVisibility.trafficLight || overlayVisibility.stopLine) drawTrafficLightTools();
}

export function updateTrafficLightState() {
    const source = inferenceCanvas.width ? inferenceCanvas : canvas;
    const left = Math.floor(trafficLightConfig.x * source.width);
    const top = Math.floor(trafficLightConfig.y * source.height);
    const width = Math.max(1, Math.floor(trafficLightConfig.width * source.width));
    const height = Math.max(1, Math.floor(trafficLightConfig.height * source.height));
    const pixels = source.getContext('2d').getImageData(left, top, width, height).data;
    let red = 0;
    let green = 0;
    let yellow = 0;
    for (let index = 0; index < pixels.length; index += 16) {
        const color = rgbToHsv(pixels[index], pixels[index + 1], pixels[index + 2]);
        if (color.saturation > 0.35 && color.value > 0.25) {
            if (color.hue < 0.08 || color.hue > 0.92) red++;
            else if (color.hue > 0.20 && color.hue < 0.45) green++;
            else if (color.hue >= 0.08 && color.hue <= 0.20) yellow++;
        }
    }
    const state = red > green * 1.15 && red > yellow * 1.15 ? 'red' : green > red * 1.15 && green > yellow ? 'green' : yellow > red && yellow > green ? 'yellow' : 'unknown';
    setTrafficLightState(state);
    return state;
}

function rgbToHsv(red, green, blue) {
    red /= 255; green /= 255; blue /= 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let hue = 0;
    if (delta) {
        if (max === red) hue = ((green - blue) / delta) % 6;
        else if (max === green) hue = (blue - red) / delta + 2;
        else hue = (red - green) / delta + 4;
        hue /= 6;
        if (hue < 0) hue += 1;
    }
    return { hue, saturation: max ? delta / max : 0, value: max };
}

function drawSideDivider() {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const startX = sideDividerConfig.start.x * canvas.width;
    const startY = sideDividerConfig.start.y * canvas.height;
    const endX = sideDividerConfig.end.x * canvas.width;
    const endY = sideDividerConfig.end.y * canvas.height;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#111827';
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 13px Segoe UI';
    const rightLabelX = Math.max(12, startX + 12);
    ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
    ctx.fillRect(8, 7, 54, 22);
    ctx.fillRect(rightLabelX - 5, 7, 58, 22);
    ctx.fillStyle = '#22c55e';
    ctx.fillText('TRÁI', 14, 23);
    ctx.fillText('PHẢI', rightLabelX, 23);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(startX, startY, 11, 0, Math.PI * 2);
    ctx.arc(endX, endY, 11, 0, Math.PI * 2);
    ctx.fill();
    if (getDividerDragMode()) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Segoe UI';
        ctx.fillText('KÉO VẠCH PHÂN LÀN', Math.min(canvas.width - 190, startX + 15), Math.max(18, startY + 18));
    }
    ctx.restore();
}

function drawTrafficLightTools() {
    const roiX = trafficLightConfig.x * canvas.width;
    const roiY = trafficLightConfig.y * canvas.height;
    const roiWidth = trafficLightConfig.width * canvas.width;
    const roiHeight = trafficLightConfig.height * canvas.height;
    const startX = stopLineConfig.start.x * canvas.width;
    const startY = stopLineConfig.start.y * canvas.height;
    const endX = stopLineConfig.end.x * canvas.width;
    const endY = stopLineConfig.end.y * canvas.height;
    ctx.save();
    if (overlayVisibility.trafficLight) {
        ctx.fillStyle = 'rgba(127, 29, 29, 0.72)';
        ctx.fillRect(roiX, roiY, roiWidth, roiHeight);
    }
    if (!overlayVisibility.trafficLight && !overlayVisibility.stopLine) return;
    if (overlayVisibility.trafficLight) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 8;
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(roiX, roiY, roiWidth, roiHeight);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 5;
        ctx.strokeRect(roiX, roiY, roiWidth, roiHeight);
    }
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 14;
    ctx.setLineDash([]);
    ctx.beginPath();
    if (overlayVisibility.stopLine) { ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke(); }
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 9;
    ctx.beginPath();
    if (overlayVisibility.stopLine) { ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke(); }
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px Segoe UI';
    if (overlayVisibility.trafficLight) ctx.fillText('VÙNG ĐÈN', roiX, Math.max(14, roiY - 6));
    const lightState = getTrafficLightState();
    ctx.fillStyle = lightState === 'red' ? '#ef4444' : lightState === 'green' ? '#22c55e' : lightState === 'yellow' ? '#facc15' : '#f8fafc';
    if (overlayVisibility.trafficLight) ctx.fillText(`ĐÈN: ${lightState.toUpperCase()}`, roiX, roiY + roiHeight + 16);
    ctx.fillStyle = '#fb923c';
    if (overlayVisibility.stopLine) ctx.fillText('VẠCH DỪNG', Math.min(canvas.width - 100, startX + 8), Math.max(16, startY - 8));
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    if (overlayVisibility.stopLine) { ctx.arc(startX, startY, 12, 0, Math.PI * 2); ctx.arc(endX, endY, 12, 0, Math.PI * 2); }
    ctx.fill();
    if (overlayVisibility.trafficLight) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(roiX - 8, roiY - 8, 16, 16);
        ctx.fillRect(roiX + roiWidth - 8, roiY + roiHeight - 8, 16, 16);
    }
    if (getTrafficLightDragMode() || getStopLineDragMode()) {
        ctx.fillStyle = '#ffffff';
        ctx.fillText('KÉO ĐỂ ĐIỀU CHỈNH', Math.min(canvas.width - 170, roiX + roiWidth + 10), roiY + 16);
    }
    ctx.restore();
}

export function resetLinePosition() {
    lineConfig.positionRatio = 0.35;
    countLineConfig.start = { x: 0, y: 0.35 };
    countLineConfig.end = { x: 1, y: 0.35 };
    drawScene(latestDetections);
}

function getCategoryColor(className) {
    switch (className) {
        case 'car': return '#2563eb';
        case 'motorcycle': return '#16a34a';
        case 'bus': return '#d97706';
        case 'truck': return '#dc2626';
        default: return '#38bdf8';
    }
}
