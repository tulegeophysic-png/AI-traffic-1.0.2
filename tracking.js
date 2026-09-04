import { calculateIoU } from './detection.js';
import { canvas, lineConfig, recentVehicles, countsLeft, countsRight, countsTotal, getCountingLineEnabled, isLeftOfDivider, getStopLineSide, getCountLineSide, getTrafficLightState, getRedStartedAt, isRedLightMode } from './main.js';
import { recordTrafficViolation } from './dashboard.js';

let uniqueIdCounter = 1;

export function resetTracking() {
    recentVehicles.clear();
    uniqueIdCounter = 1;
}

export function matchAndCountVehicles(detections) {
    const activeVehicles = [];
    const directionMode = document.getElementById('counting-direction').value;
    const nowTime = Date.now();

    for (const [id, value] of recentVehicles.entries()) {
        if (nowTime - value.time > 8000) recentVehicles.delete(id);
    }

    const orderedDetections = [...detections].sort((first, second) => second.confidence - first.confidence);
    const candidateMatches = [];
    const baseMatchDistance = Math.max(220, Math.min(canvas.width, canvas.height) * 0.20);

    orderedDetections.forEach((detection, detectionIndex) => {
        const [x, y, width, height] = detection.bbox;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        for (const [id, value] of recentVehicles.entries()) {
            if (value.className === detection.className) {
                const elapsedSeconds = Math.min((nowTime - value.time) / 1000, 1);
                const predictedX = value.cx + (value.vx || 0) * elapsedSeconds;
                const predictedY = value.cy + (value.vy || 0) * elapsedSeconds;
                const distance = Math.hypot(centerX - predictedX, centerY - predictedY);
                const overlap = value.bbox ? calculateIoU(detection.bbox, value.bbox) : 0;
                const speedAllowance = Math.hypot(value.vx || 0, value.vy || 0) * elapsedSeconds;
                const classAllowance = detection.className === 'bus' ? 180 : detection.className === 'car' ? 150 : 120;
                const classBaseDistance = detection.className === 'car' ? 150 : baseMatchDistance;
                const maxMatchDistance = Math.max(classBaseDistance, speedAllowance + classAllowance);
                const horizontalDistance = Math.abs(centerX - predictedX);
                const horizontalGate = detection.className === 'car' ? Math.max(110, Math.abs(value.vx || 0) * elapsedSeconds + 80) : maxMatchDistance;
                const minimumOverlap = detection.className === 'car' ? 0.12 : 0.05;
                if (overlap >= minimumOverlap || (distance <= maxMatchDistance && horizontalDistance <= horizontalGate)) {
                    candidateMatches.push({ detectionIndex, id, score: overlap * 1000 - distance });
                }
            }
        }
    });

    candidateMatches.sort((first, second) => second.score - first.score);
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

    orderedDetections.forEach((detection, detectionIndex) => {
        const [x, y, width, height] = detection.bbox;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        let assignedId = assignedIds.get(detectionIndex);
        if (!assignedId) assignedId = uniqueIdCounter++;

        const oldData = recentVehicles.get(assignedId);
        if (oldData && getCountingLineEnabled() && !oldData.counted) {
            const previousHeight = oldData.height || oldData.bbox[3];
            const previousTop = oldData.cy - previousHeight / 2;
            const previousBottom = oldData.cy + previousHeight / 2;
            const currentTop = centerY - height / 2;
            const currentBottom = centerY + height / 2;
            const movedDown = centerY > oldData.cy;
            const movedUp = centerY < oldData.cy;
            const currentCountSide = getCountLineSide(centerX, centerY);
            const crossedDown = oldData.countLineSide < 0 && currentCountSide >= 0;
            const crossedUp = oldData.countLineSide > 0 && currentCountSide <= 0;
            const sweptDown = crossedDown;
            const sweptUp = crossedUp;
            let crossed = false;

            if (directionMode === 'both') {
                crossed = (movedDown && (crossedDown || sweptDown)) || (movedUp && (crossedUp || sweptUp));
            } else if (directionMode === 'down') {
                crossed = movedDown && (crossedDown || sweptDown);
            } else if (directionMode === 'up') {
                crossed = movedUp && (crossedUp || sweptUp);
            }

            if (crossed) {
                oldData.counted = true;
                const isLeftSide = oldData.side === 'left' || oldData.leftSideVotes >= oldData.rightSideVotes;
                const sideCounts = isLeftSide ? countsLeft : countsRight;
                sideCounts[detection.className]++;
                sideCounts.total++;
                countsTotal[detection.className]++;
                countsTotal.total++;
            }
        }

        const stopLineSide = getStopLineSide(centerX, centerY);
        if (oldData && !oldData.stopLineCrossed && oldData.stopLineSide !== stopLineSide) {
            oldData.stopLineCrossed = true;
            const redStartedAt = getRedStartedAt();
            if (isRedLightMode() && getTrafficLightState() === 'red' && redStartedAt && nowTime >= redStartedAt && !oldData.violationRecorded) {
                oldData.violationRecorded = true;
                const evidenceName = `red-light-${assignedId}-${nowTime}.png`;
                captureVehicleEvidence(detection.bbox, evidenceName);
                recordTrafficViolation({ id: assignedId, className: detection.className, evidenceName });
            }
        }

        const elapsedSeconds = oldData ? Math.max((nowTime - oldData.time) / 1000, 0.001) : 0;
        const velocityX = oldData ? (centerX - oldData.cx) / elapsedSeconds : 0;
        const velocityY = oldData ? (centerY - oldData.cy) / elapsedSeconds : 0;
        const isLeftOfLaneDivider = isLeftOfDivider(centerX, centerY);
        const leftSideVotes = oldData?.leftSideVotes || (isLeftOfLaneDivider ? 1 : 0);
        const rightSideVotes = oldData?.rightSideVotes || (isLeftOfLaneDivider ? 0 : 1);
        const side = oldData?.side || (isLeftOfLaneDivider ? 'left' : 'right');
        recentVehicles.set(assignedId, {
            cx: centerX,
            cy: centerY,
            bbox: detection.bbox,
            width,
            height,
            className: detection.className,
            counted: oldData ? oldData.counted : false,
            leftSideVotes,
            rightSideVotes,
            side,
            stopLineSide: oldData?.stopLineSide || stopLineSide,
            stopLineCrossed: oldData ? oldData.stopLineCrossed : false,
            violationRecorded: oldData ? oldData.violationRecorded : false,
            countLineSide: oldData?.countLineSide || getCountLineSide(centerX, centerY),
            time: nowTime,
            vx: Math.max(-1000, Math.min(1000, velocityX)),
            vy: Math.max(-1000, Math.min(1000, velocityY))
        });
        activeVehicles.push({ id: assignedId, bbox: [x, y, width, height], className: detection.className, confidence: detection.confidence });
    });

    return activeVehicles;
}

function captureVehicleEvidence(bbox, fileName) {
    const [x, y, width, height] = bbox;
    const marginX = Math.max(width * 0.45, 40);
    const marginY = Math.max(height * 0.45, 40);
    const sourceX = Math.max(0, x - marginX);
    const sourceY = Math.max(0, y - marginY);
    const sourceRight = Math.min(canvas.width, x + width + marginX);
    const sourceBottom = Math.min(canvas.height, y + height + marginY);
    const cropWidth = Math.max(1, sourceRight - sourceX);
    const cropHeight = Math.max(1, sourceBottom - sourceY);
    const evidenceCanvas = document.createElement('canvas');
    const scale = Math.min(3, Math.max(1, 900 / cropWidth));
    evidenceCanvas.width = Math.round(cropWidth * scale);
    evidenceCanvas.height = Math.round(cropHeight * scale);
    const evidenceContext = evidenceCanvas.getContext('2d');
    evidenceContext.drawImage(canvas, sourceX, sourceY, cropWidth, cropHeight, 0, 0, evidenceCanvas.width, evidenceCanvas.height);
    const link = document.createElement('a');
    link.download = fileName;
    link.href = evidenceCanvas.toDataURL('image/png');
    link.click();
}
