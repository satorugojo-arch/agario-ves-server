const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

let players = {};
let foods = [];
let viruses = [];
const MAP_SIZE = 5000; // Mapa reducido a 5000px

// Generar Comida
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

// Generar Virus Mortales
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

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'join') {
                players[playerId] = {
                    id: playerId,
                    name: data.name || 'Jugador',
                    color: data.color || '#00e699',
                    x: Math.random() * (MAP_SIZE - 600) + 300,
                    y: Math.random() * (MAP_SIZE - 600) + 300,
                    radius: 25, // Equivalente a 300 VES
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

                    // Escapar al llegar a 9000 VES y tocar el borde
                    if (currentVes >= 9000) {
                        if (nextX <= 0 || nextX >= MAP_SIZE || nextY <= 0 || nextY >= MAP_SIZE) {
                            if (player.ws && player.ws.readyState === WebSocket.OPEN) {
                                player.ws.send(JSON.stringify({ type: 'escaped', vesGained: currentVes }));
                            }
                            delete players[playerId];
                            return;
                        }
                    }

                    player.x = Math.max(player.radius, Math.min(MAP_SIZE - player.radius, nextX));
                    player.y = Math.max(player.radius, Math.min(MAP_SIZE - player.radius, nextY));
                }
            }
        } catch (e) {
            console.error(e);
        }
    });

    ws.on('close', () => {
        delete players[playerId];
    });
});

setInterval(() => {
    // 1. Colisión con Comida
    Object.values(players).forEach(p => {
        foods.forEach((f, index) => {
            if (Math.hypot(p.x - f.x, p.y - f.y) < p.radius) {
                p.radius += 0.2;
                foods[index] = {
                    x: Math.random() * MAP_SIZE,
                    y: Math.random() * MAP_SIZE,
                    color: `hsl(${Math.random() * 360}, 100%, 50%)`
                };
            }
        });

        // 2. Colisión MORTAL con Virus
        viruses.forEach(v => {
            const dist = Math.hypot(p.x - v.x, p.y - v.y);
            if (dist < p.radius + v.radius - 10) {
                // El jugador muere instantáneamente
                if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                    p.ws.send(JSON.stringify({ type: 'killed_by_virus' }));
                }
                delete players[p.id];
            }
        });
    });

    // 3. Colisión entre Jugadores (Transfiere 66.6% de la masa)
    const playerList = Object.values(players);
    for (let i = 0; i < playerList.length; i++) {
        for (let j = 0; j < playerList.length; j++) {
            if (i !== j) {
                const p1 = playerList[i];
                const p2 = playerList[j];

                if (p1 && p2 && p1.radius > p2.radius * 1.1) {
                    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                    if (dist < p1.radius) {
                        p1.radius += p2.radius * 0.666;
                        delete players[p2.id];
                    }
                }
            }
        }
    }

    // Preparar estado público de jugadores y Leaderboard
    const publicPlayers = {};
    const leaderboardArray = [];

    Object.values(players).forEach(p => {
        const vesVal = Math.floor(300 + (p.radius - 25) * 50);
        publicPlayers[p.id] = {
            id: p.id,
            name: p.name,
            x: p.x,
            y: p.y,
            radius: p.radius,
            color: p.color
        };
        leaderboardArray.push({ name: p.name, ves: vesVal });
    });

    // Ordenar Leaderboard Top 5
    leaderboardArray.sort((a, b) => b.ves - a.ves);
    const top5 = leaderboardArray.slice(0, 5);

    const stateMsg = JSON.stringify({
        type: 'state',
        players: publicPlayers,
        foods: foods,
        viruses: viruses,
        leaderboard: top5
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(stateMsg);
        }
    });
}, 1000 / 30);

console.log(`Servidor TRAGABOLIVARES activo con Virus Mortales y Leaderboard.`);
