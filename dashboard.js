import { countsLeft, countsRight, countsTotal } from './main.js';

let chartInstance = null;

export function initChart() {
    const chartCanvas = document.getElementById('trafficChart');
    if (!chartCanvas) return;
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
        if (density === 'HIGH') {
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
