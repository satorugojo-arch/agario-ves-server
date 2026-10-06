const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

// CONFIGURACIÓN DE TU BOT DE TELEGRAM
const TELEGRAM_BOT_TOKEN = "8934476656:AAFNjEHnYKDstq89rQjxAOwn6cUU2NvjwpM";
const TELEGRAM_CHAT_ID = "1564515834";

let players = {};
let foods = [];
let viruses = [];
const MAP_SIZE = 5000;

function initFoods() {
    foods = [];
    for (let i = 0; i < 400; i++) {
        foods.push({
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`
        });
    }
}

function initViruses() {
    viruses = [];
    for (let i = 0; i < 25; i++) {
        viruses.push({
            x: Math.random() * (MAP_SIZE - 400) + 200,
            y: Math.random() * (MAP_SIZE - 400) + 200,
            radius: 35
        });
    }
}

initFoods();
initViruses();

async function sendTelegramMessage(text) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes("PEGA_AQUI")) return;
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'Markdown' })
        });
    } catch (err) {
        console.error('Error enviando a Telegram:', err);
    }
}

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'join') {
                players[playerId] = {
                    id: playerId,
                    name: data.name || 'Jugador',
                    color: data.color || '#00ff88',
                    x: Math.random() * (MAP_SIZE - 600) + 300,
                    y: Math.random() * (MAP_SIZE - 600) + 300,
                    radius: 25,
                    ws: ws
                };

                ws.send(JSON.stringify({ type: 'init', id: playerId, mapSize: MAP_SIZE }));
            }

            if (data.type === 'move' && players[playerId]) {
                const player = players[playerId];
                const dx = data.targetX - player.x;
                const dy = data.targetY - player.y;
                const dist = Math.hypot(dx, dy);

                if (dist > 5) {
                    const speed = Math.max(1.3, 7 - player.radius / 30);
                    const nextX = player.x + (dx / dist) * speed;
                    const nextY = player.y + (dy / dist) * speed;
                    
                    const currentVes = Math.floor(300 + (player.radius - 25) * 50);

                    // LÓGICA DE BORDES: Si el jugador toca cualquier borde del mapa
                    if (nextX <= player.radius || nextX >= MAP_SIZE - player.radius || nextY <= player.radius || nextY >= MAP_SIZE - player.radius) {
                        if (currentVes >= 9000) {
                            // Toca el borde y tiene >= 9000: ESCAPA
                            if (player.ws && player.ws.readyState === WebSocket.OPEN) {
                                player.ws.send(JSON.stringify({ type: 'escaped', vesGained: currentVes }));
                            }
                        } else {
                            // Toca el borde y tiene < 9000: MUERE ELIMINADO POR EL BORDE ROJO
                            if (player.ws && player.ws.readyState === WebSocket.OPEN) {
                                player.ws.send(JSON.stringify({ type: 'killed_by_border' }));
                            }
                        }
                        delete players[playerId];
                        return;
                    }

                    player.x = nextX;
                    player.y = nextY;
                }
            }

            if (data.type === 'request_withdraw') {
                const player = players[playerId];
                const requestedAmount = parseFloat(data.amount);

                if (!player) return ws.send(JSON.stringify({ type: 'withdraw_response', success: false, msg: 'Debes estar jugando.' }));

                const realBalance = Math.floor(300 + (player.radius - 25) * 50);

                if (isNaN(requestedAmount) || requestedAmount <= 0) return ws.send(JSON.stringify({ type: 'withdraw_response', success: false, msg: 'Monto inválido.' }));
                if (requestedAmount > realBalance) return ws.send(JSON.stringify({ type: 'withdraw_response', success: false, msg: `¡TRAMPA DETECTADA! Tu saldo real es de ${realBalance} VES.` }));

                const vesRestantes = realBalance - requestedAmount;
                player.radius = 25 + (vesRestantes - 300) / 50;

                const telegramMsg = `💸 *NUEVA SOLICITUD DE RETIRO*\n\n👤 *Jugador:* ${player.name}\n💰 *Monto Solicitado:* ${requestedAmount} VES\n💳 *Método:* ${data.method}\n📋 *Datos:* \`${data.details}\``;
                await sendTelegramMessage(telegramMsg);

                ws.send(JSON.stringify({ type: 'withdraw_response', success: true, msg: `Solicitud enviada a Telegram.`, newVes: vesRestantes }));
            }

        } catch (e) {
            console.error(e);
        }
    });

    ws.on('close', () => { delete players[playerId]; });
});

setInterval(() => {
    Object.values(players).forEach(p => {
        foods.forEach((f, index) => {
            if (Math.hypot(p.x - f.x, p.y - f.y) < p.radius) {
                p.radius += 0.2;
                foods[index] = { x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, color: `hsl(${Math.random() * 360}, 100%, 50%)` };
            }
        });

        viruses.forEach(v => {
            if (Math.hypot(p.x - v.x, p.y - v.y) < p.radius + v.radius - 10) {
                if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                    p.ws.send(JSON.stringify({ type: 'killed_by_virus' }));
                }
                delete players[p.id];
            }
        });
    });

    const playerList = Object.values(players);
    for (let i = 0; i < playerList.length; i++) {
        for (let j = 0; j < playerList.length; j++) {
            if (i !== j) {
                const p1 = playerList[i];
                const p2 = playerList[j];

                if (p1 && p2 && p1.radius > p2.radius * 1.1) {
                    if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < p1.radius) {
                        p1.radius += p2.radius * 0.666;
                        delete players[p2.id];
                    }
                }
            }
        }
    }

    const publicPlayers = {};
    const leaderboardArray = [];

    Object.values(players).forEach(p => {
        const vesVal = Math.floor(300 + (p.radius - 25) * 50);
        publicPlayers[p.id] = { id: p.id, name: p.name, x: p.x, y: p.y, radius: p.radius, color: p.color };
        leaderboardArray.push({ name: p.name, ves: vesVal });
    });

    leaderboardArray.sort((a, b) => b.ves - a.ves);
    const top5 = leaderboardArray.slice(0, 5);

    const stateMsg = JSON.stringify({ type: 'state', players: publicPlayers, foods: foods, viruses: viruses, leaderboard: top5 });
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(stateMsg); });
}, 1000 / 30);
