import { countsLeft, countsRight, countsTotal } from './main.js';

let chartInstance = null;
let violationList = [];
let currentLanguage = 'vi';

export function initChart() {
    const chartCanvas = document.getElementById('trafficChart');
    if (!chartCanvas) return;
    if (chartInstance) chartInstance.destroy();
    const existingChart = Chart.getChart(chartCanvas);
    if (existingChart) existingChart.destroy();
    chartInstance = new Chart(chartCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Car', 'Motorcycle', 'Bus', 'Truck'],
            datasets: [
                { label: 'Bên Trái', data: [0, 0, 0, 0], backgroundColor: '#2563eb' },
                { label: 'Bên Phải', data: [0, 0, 0, 0], backgroundColor: '#16a34a' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#1e293b' }, ticks: { color: '#f8fafc', font: { size: 9 } } },
                x: { grid: { display: false }, ticks: { color: '#f8fafc', font: { size: 9 } } }
            },
            plugins: { legend: { labels: { color: '#f8fafc', font: { size: 9 } } } }
        }
    });
}

export function setStatus(className, text) {
    const badge = document.getElementById('system-status');
    if (badge) {
        badge.className = `status-pill ${className}`;
        badge.innerText = text;
    }
}

export function updateUIStats() {
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.innerText = value;
    };
    setText('count-car-left', countsLeft.car); setText('count-car-right', countsRight.car); setText('count-car', countsTotal.car);
    setText('count-moto-left', countsLeft.motorcycle); setText('count-moto-right', countsRight.motorcycle); setText('count-moto', countsTotal.motorcycle);
    setText('count-bus-left', countsLeft.bus); setText('count-bus-right', countsRight.bus); setText('count-bus', countsTotal.bus);
    setText('count-truck-left', countsLeft.truck); setText('count-truck-right', countsRight.truck); setText('count-truck', countsTotal.truck);
    setText('count-left-total', countsLeft.total); setText('count-right-total', countsRight.total); setText('count-total', countsTotal.total);

    let density = 'LOW';
    let densityClass = 'density-low';
    if (countsTotal.total >= 40) {
        density = 'HIGH';
        densityClass = 'density-high';
    } else if (countsTotal.total >= 15) {
        density = 'MEDIUM';
        densityClass = 'density-med';
    }

    const densityBadge = document.getElementById('density-status');
    if (densityBadge) {
        densityBadge.className = `density-badge ${densityClass}`;
        densityBadge.innerText = density;
    }

    const banner = document.getElementById('congestion-banner');
    if (banner) {
        if (violationList.length > 0) {
            banner.style.background = '#b91c1c';
            banner.innerText = `ĐÈN ĐỎ: ${violationList.length} VI PHẠM`;
        } else if (density === 'HIGH') {
            banner.style.background = '#dc2626';
            banner.innerText = '⚠️ TRAFFIC CONGESTION WARNING';
        } else {
            banner.style.background = '#16a34a';
            banner.innerText = '✓ TRAFFIC NORMAL';
        }
    }

    if (chartInstance) {
        chartInstance.data.datasets[0].data = [countsLeft.car, countsLeft.motorcycle, countsLeft.bus, countsLeft.truck];
        chartInstance.data.datasets[1].data = [countsRight.car, countsRight.motorcycle, countsRight.bus, countsRight.truck];
        chartInstance.update();
    }
}

export function recordTrafficViolation(vehicle) {
    if (violationList.some(violation => violation.id === vehicle.id)) return;
    const violation = { ...vehicle, time: new Date().toLocaleTimeString() };
    violationList.push(violation);
    const banner = document.getElementById('congestion-banner');
    if (banner) {
        banner.style.background = '#b91c1c';
        banner.innerText = `ĐÈN ĐỎ: ID #${violation.id} - ${violation.className.toUpperCase()}`;
    }
    let panel = document.getElementById('red-light-violations');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'red-light-violations';
        panel.style.cssText = 'margin-top:8px;padding:6px;border:1px solid #ef4444;background:#450a0a;color:#fff;font-size:11px;max-height:120px;overflow:auto;';
        const bannerParent = banner ? banner.parentElement : document.body;
        bannerParent.appendChild(panel);
    }
    const item = document.createElement('div');
    item.innerText = `ID #${violation.id} | ${violation.className.toUpperCase()} | ${violation.time} | Ảnh: ${violation.evidenceName}`;
    panel.appendChild(item);
}

export function resetTrafficViolations() {
    violationList = [];
    const panel = document.getElementById('red-light-violations');
    if (panel) panel.remove();
}

export function setLanguage(language) {
    currentLanguage = language === 'en' ? 'en' : 'vi';
    document.documentElement.lang = currentLanguage;
    const guide = document.getElementById('usage-guide');
    if (guide) {
        guide.innerHTML = currentLanguage === 'en'
            ? '<b>Usage guide</b><br>1. Choose a video or connect a camera stream.<br>2. Select Counting mode and adjust the green lane divider and red counting line.<br>3. Select Red-light mode, place the dark-red traffic-light region around the signal and place the stop line across the road.<br>4. Press Start AI. Export CSV opens directly in Excel.'
            : '<b>Hướng dẫn sử dụng</b><br>1. Chọn video hoặc kết nối camera stream.<br>2. Chọn chế độ đếm xe, chỉnh vạch phân làn xanh và vạch đếm đỏ.<br>3. Chọn chế độ đèn đỏ, đặt vùng đỏ đậm quanh đèn và vạch dừng ngang đường.<br>4. Nhấn Chạy AI. Nút Xuất Excel tạo file CSV mở được bằng Excel.';
    }
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const text = element.dataset[`i18n${currentLanguage === 'en' ? 'En' : 'Vi'}`];
        if (text) element.innerText = text;
    });
    translateDashboardText(currentLanguage);
}

function translateDashboardText(language) {
    const translations = language === 'en' ? {
        'Hệ Thống Giám Sát & Đếm Phương Tiện Giao Thông AI (YOLOv10)': 'AI Traffic Monitoring & Vehicle Counting (YOLOv10)',
        'Trạng thái:': 'Status:', 'Chạy AI': 'Start AI', 'Dừng lại': 'Stop', 'Reset Thống Kê': 'Reset Statistics',
        'Chụp Khung Hình': 'Capture Frame', 'Tinh Chỉnh Mức Nhận Diện (Confidence Threshold) Đề Xuất:': 'Detection Confidence Thresholds:',
        'Hướng đếm phương tiện:': 'Counting direction:', 'Đếm Cả 2 Chiều (Lên & Xuống)': 'Both directions (Up & Down)',
        'Chỉ từ Trên xuống Dưới': 'Top to bottom only', 'Chỉ từ Dưới lên Trên': 'Bottom to top only',
        'Vạch: ON': 'Line: ON', 'Vạch: OFF': 'Line: OFF', 'Reset Vạch Đếm': 'Reset Counting Line',
        'Đồng hồ hệ thống:': 'System clock:', 'Bảng Thống Kê Phương Tiện': 'Vehicle Statistics',
        'Mật độ giao thông:': 'Traffic density:', 'Loại xe': 'Vehicle type', 'Trái': 'Left', 'Phải': 'Right',
        'TỔNG CỘNG': 'TOTAL', 'Biểu Đồ Phân Bố': 'Distribution Chart', 'Thông Tin Phân Tích & Hệ Thống': 'Analysis & System Information',
        'Trạng thái Tracking:': 'Tracking status:', 'Độ phân giải AI:': 'AI resolution:',
        'Confidence Threshold hoạt động chuẩn theo slider chỉnh tay': 'Confidence thresholds follow the sliders',
        'Vạch đếm': 'Counting line', 'Phân làn': 'Lane divider', 'Vùng đèn': 'Traffic-light region', 'Vạch dừng': 'Stop line',
        'Chế độ đếm xe': 'Vehicle counting mode', 'Chế độ đèn đỏ': 'Red-light mode', 'ON': 'ON', 'OFF': 'OFF',
        'Vạch đếm phương tiện': 'Vehicle counting line', 'KÉO 2 ĐẦU': 'DRAG BOTH ENDS',
        'TRAFFIC NORMAL': 'TRAFFIC NORMAL', 'TRAFFIC CONGESTION WARNING': 'TRAFFIC CONGESTION WARNING'
    } : {
        'AI Traffic Monitoring & Vehicle Counting (YOLOv10)': 'Hệ Thống Giám Sát & Đếm Phương Tiện Giao Thông AI (YOLOv10)',
        'Status:': 'Trạng thái:', 'Start AI': 'Chạy AI', 'Stop': 'Dừng lại', 'Reset Statistics': 'Reset Thống Kê',
        'Capture Frame': 'Chụp Khung Hình', 'Detection Confidence Thresholds:': 'Tinh Chỉnh Mức Nhận Diện (Confidence Threshold) Đề Xuất:',
        'Counting direction:': 'Hướng đếm phương tiện:', 'Both directions (Up & Down)': 'Đếm Cả 2 Chiều (Lên & Xuống)',
        'Top to bottom only': 'Chỉ từ Trên xuống Dưới', 'Bottom to top only': 'Chỉ từ Dưới lên Trên',
        'Line: ON': 'Vạch: ON', 'Line: OFF': 'Vạch: OFF', 'Reset Counting Line': 'Reset Vạch Đếm',
        'System clock:': 'Đồng hồ hệ thống:', 'Vehicle Statistics': 'Bảng Thống Kê Phương Tiện',
        'Traffic density:': 'Mật độ giao thông:', 'Vehicle type': 'Loại xe', 'Left': 'Trái', 'Right': 'Phải',
        'TOTAL': 'TỔNG CỘNG', 'Distribution Chart': 'Biểu Đồ Phân Bố', 'Analysis & System Information': 'Thông Tin Phân Tích & Hệ Thống',
        'Tracking status:': 'Trạng thái Tracking:', 'AI resolution:': 'Độ phân giải AI:',
        'Confidence thresholds follow the sliders': 'Confidence Threshold hoạt động chuẩn theo slider chỉnh tay',
        'Counting line': 'Vạch đếm', 'Lane divider': 'Phân làn', 'Traffic-light region': 'Vùng đèn', 'Stop line': 'Vạch dừng',
        'Vehicle counting mode': 'Chế độ đếm xe', 'Red-light mode': 'Chế độ đèn đỏ', 'Vehicle counting line': 'Vạch đếm phương tiện', 'DRAG BOTH ENDS': 'KÉO 2 ĐẦU'
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(node => {
        let text = node.nodeValue;
        Object.entries(translations).forEach(([from, to]) => { text = text.replaceAll(from, to); });
        node.nodeValue = text;
    });
}

export function exportTrafficCsv() {
    const rows = [
        ['Traffic statistics', 'Value'],
        ['Car left', countsLeft.car], ['Car right', countsRight.car], ['Car total', countsTotal.car],
        ['Motorcycle left', countsLeft.motorcycle], ['Motorcycle right', countsRight.motorcycle], ['Motorcycle total', countsTotal.motorcycle],
        ['Bus left', countsLeft.bus], ['Bus right', countsRight.bus], ['Bus total', countsTotal.bus],
        ['Truck left', countsLeft.truck], ['Truck right', countsRight.truck], ['Truck total', countsTotal.truck],
        ['Total left', countsLeft.total], ['Total right', countsRight.total], ['Total', countsTotal.total],
        ['Chart - Car left', countsLeft.car], ['Chart - Car right', countsRight.car],
        ['Chart - Motorcycle left', countsLeft.motorcycle], ['Chart - Motorcycle right', countsRight.motorcycle],
        ['Chart - Bus left', countsLeft.bus], ['Chart - Bus right', countsRight.bus],
        ['Chart - Truck left', countsLeft.truck], ['Chart - Truck right', countsRight.truck],
        ['Export time', new Date().toLocaleString()]
    ];
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.download = `traffic-report-${Date.now()}.csv`;
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.click();
    URL.revokeObjectURL(link.href);
}
