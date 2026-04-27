const C = 299792.458; //швидкість світла в км/с

let satellitesMap = new Map();
let chart = null;
let analyticPos = null;
let numericPos = null;
let ws = null;
let zoneSize = 200;

function initChart() {
    const ctx = document.getElementById('chart').getContext('2d');

    chart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Супутники',
                    backgroundColor: '#58a6ff',
                    pointRadius: 8,
                    pointHoverRadius: 10,
                    data: []
                },
                {
                    label: 'Аналітичний метод',
                    backgroundColor: '#39d353',
                    borderColor: '#39d353',
                    pointRadius: 14,
                    pointHoverRadius: 16,
                    pointStyle: 'star',
                    data: []
                },
                {
                    label: 'Чисельний метод',
                    backgroundColor: '#ffa657',
                    borderColor: '#ffa657',
                    pointRadius: 12,
                    pointHoverRadius: 14,
                    pointStyle: 'crossRot',
                    borderWidth: 3,
                    data: []
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    min: 0,
                    max: zoneSize,
                    title: { display: true, text: 'X (км)', color: '#656d76' },
                    grid: { color: 'rgba(0,0,0,0.06)' },
                    ticks: { color: '#656d76', font: { family: 'Share Tech Mono' } }
                },
                y: {
                    min: 0,
                    max: zoneSize,
                    title: { display: true, text: 'Y (км)', color: '#656d76' },
                    grid: { color: 'rgba(0,0,0,0.06)' },
                    ticks: { color: '#656d76', font: { family: 'Share Tech Mono' } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` (${ctx.parsed.x.toFixed(2)}, ${ctx.parsed.y.toFixed(2)}) км`
                    }
                }
            }
        }
    });
}

//вибір трьох супутників з найменшою затримкою сигналу
function getThreeSatellites() {
    const all = Array.from(satellitesMap.values());
    if (all.length < 3) return null;
    all.sort((a, b) => (a.receivedAt - a.sentAt) - (b.receivedAt - b.sentAt));
    return all.slice(0, 3);
}

//перевірка чи всі три супутники знаходяться в межах зони
function allSatsInBounds(sats) {
    return sats.every(s =>
        s.x >= 0 && s.x <= zoneSize &&
        s.y >= 0 && s.y <= zoneSize
    );
}

//аналітичний метод - лінеаризація системи трьох рівнянь кіл
function analyticalMethod(sats) {
    const [s1, s2, s3] = sats;

    const d1 = C * Math.max(0, (s1.receivedAt - s1.sentAt) / 1000);
    const d2 = C * Math.max(0, (s2.receivedAt - s2.sentAt) / 1000);
    const d3 = C * Math.max(0, (s3.receivedAt - s3.sentAt) / 1000);

    const A = 2 * (s2.x - s1.x);
    const B = 2 * (s2.y - s1.y);
    const C_val = d1*d1 - d2*d2 + s2.x**2 - s1.x**2 + s2.y**2 - s1.y**2;

    const D = 2 * (s3.x - s2.x);
    const E = 2 * (s3.y - s2.y);
    const F = d2*d2 - d3*d3 + s3.x**2 - s2.x**2 + s3.y**2 - s2.y**2;

    const det = A * E - B * D;

    //вироджена геометрія - супутники майже на одній прямій
    if (Math.abs(det) < 1e-6) return null;

    return {
        x: (C_val * E - B * F) / det,
        y: (A * F - C_val * D) / det
    };
}

//чисельний метод - градієнтний спуск без зовнішніх бібліотек
function numericalMethod(sats) {
    const measured = sats.map(s => C * Math.max(0, (s.receivedAt - s.sentAt) / 1000));

    //початкове наближення - центр мас трьох супутників
    let x = (sats[0].x + sats[1].x + sats[2].x) / 3;
    let y = (sats[0].y + sats[1].y + sats[2].y) / 3;

    const alpha = 0.01;

    for (let i = 0; i < 200; i++) {
        let gx = 0, gy = 0;

        for (let j = 0; j < sats.length; j++) {
            const dx = x - sats[j].x;
            const dy = y - sats[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1e-9;
            const err = dist - measured[j];
            gx += err * dx / dist;
            gy += err * dy / dist;
        }

        x -= alpha * gx;
        y -= alpha * gy;
    }

    return { x, y };
}

//обробка даних після кожного повідомлення від емулятора
function processData() {
    const sats = getThreeSatellites();

    if (!sats) {
        updateInfoPanel(satellitesMap.size, null);
        return;
    }

    chart.data.datasets[0].data = sats.map(s => ({ x: s.x, y: s.y }));

    const inBounds = allSatsInBounds(sats);

    if (inBounds) {
        analyticPos = analyticalMethod(sats);
        numericPos = numericalMethod(sats);
        chart.data.datasets[1].data = analyticPos ? [{ x: analyticPos.x, y: analyticPos.y }] : [];
        chart.data.datasets[2].data = numericPos ? [{ x: numericPos.x, y: numericPos.y }] : [];
    }

    chart.update('none');
    updateInfoPanel(3, inBounds);
}

//оновлення інфо-панелі
function updateInfoPanel(satCount, inBounds) {
    document.getElementById('satCount').textContent = satCount;

    const statusEl = document.getElementById('visibilityStatus');
    if (statusEl) {
        if (inBounds === false) {
            statusEl.textContent = '⚠ Супутник поза межами — пауза';
            statusEl.style.color = 'var(--red)';
        } else if (inBounds === true) {
            statusEl.textContent = '✓ Всі супутники у зоні';
            statusEl.style.color = 'var(--accent)';
        } else {
            statusEl.textContent = '— Очікування даних...';
            statusEl.style.color = 'var(--muted)';
        }
    }

    document.getElementById('anaPos').textContent = analyticPos
        ? `(${analyticPos.x.toFixed(2)}, ${analyticPos.y.toFixed(2)})`
        : '—';

    document.getElementById('numPos').textContent = numericPos
        ? `(${numericPos.x.toFixed(2)}, ${numericPos.y.toFixed(2)})`
        : '—';

    if (analyticPos && numericPos) {
        const diff = Math.hypot(analyticPos.x - numericPos.x, analyticPos.y - numericPos.y);
        document.getElementById('diff').textContent = diff.toFixed(3);
    } else {
        document.getElementById('diff').textContent = '—';
    }
}

//підключення до websocket з автоматичним перепідключенням
function connectWS() {
    ws = new WebSocket('ws://localhost:4001');

    ws.onopen = () => setStatus(true, 'Connected');

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            satellitesMap.set(data.id, data);
            processData();
        } catch (e) {
            console.error('помилка розбору даних:', e);
        }
    };

    ws.onclose = () => {
        setStatus(false, 'Reconnecting...');
        setTimeout(connectWS, 2000);
    };

    ws.onerror = () => setStatus(false, 'Error');
}

//оновлення індикатора статусу з'єднання
function setStatus(connected, text) {
    document.getElementById('dot').className = 'status-dot' + (connected ? ' on' : '');
    document.getElementById('statusLabel').textContent = text;
}

//надсилання параметрів на сервер через api
async function applyConfig() {
    zoneSize = parseFloat(document.getElementById('inZone').value) || 200;

    const config = {
        emulationZoneSize: zoneSize,
        messageFrequency: parseFloat(document.getElementById('inFreq').value),
        satelliteSpeed: parseFloat(document.getElementById('inSatSpeed').value),
        objectSpeed: parseFloat(document.getElementById('inObjSpeed').value)
    };

    try {
        const res = await fetch('http://localhost:4001/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        if (res.ok) {
            chart.options.scales.x.min = 0;
            chart.options.scales.x.max = zoneSize;
            chart.options.scales.y.min = 0;
            chart.options.scales.y.max = zoneSize;
            clearData();
        }
    } catch (e) {
        console.error('помилка відправки параметрів:', e);
    }
}

//очищення даних і графіка
function clearData() {
    satellitesMap.clear();
    analyticPos = null;
    numericPos = null;
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.data.datasets[2].data = [];
    chart.update();
    updateInfoPanel(0, null);
}

initChart();
connectWS();