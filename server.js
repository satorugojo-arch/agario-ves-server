// Servidor Multijugador Real-Time con Node.js y WebSocket
const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 3000 });

const WORLD_SIZE = 8000; // Mapa gigante
let players = {};

console.log('Servidor Agar.io VES iniciado en ws://localhost:3000');

server.on('connection', (ws) => {
  const playerId = Math.random().toString(36).substring(2, 9);
  
  // Posición inicial aleatoria dentro del mapa gigante
  players[playerId] = {
    id: playerId,
    x: Math.random() * (WORLD_SIZE - 400) + 200,
    y: Math.random() * (WORLD_SIZE - 400) + 200,
    radius: 24,
    ves: 300,
    name: 'Jugador',
    color: `hsl(${Math.floor(Math.random() * 360)}, 80%, 50%)`
  };

  // Enviar ID al nuevo jugador
  ws.send(JSON.stringify({ type: 'init', id: playerId, worldSize: WORLD_SIZE }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'join') {
        if (players[playerId]) players[playerId].name = data.name || 'Jugador';
      }

      if (data.type === 'move') {
        const p = players[playerId];
        if (!p) return;

        // Movimiento basado en las coordenadas enviadas por el cliente
        const dx = data.targetX - p.x;
        const dy = data.targetY - p.y;
        const dist = Math.hypot(dx, dy);
        const speed = Math.max(2, 8 - p.radius / 20);

        if (dist > 5) {
          p.x += (dx / dist) * speed;
          p.y += (dy / dist) * speed;
        }

        // Colisión con los bordes rojos
        if (p.x - p.radius <= 0 || p.x + p.radius >= WORLD_SIZE ||
            p.y - p.radius <= 0 || p.y + p.radius >= WORLD_SIZE) {
          ws.send(JSON.stringify({ type: 'dead', reason: 'border' }));
          delete players[playerId];
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

// Bucle de física del servidor (60 FPS) y verificación de colisiones entre jugadores
setInterval(() => {
  const ids = Object.keys(players);

  // Colisión Jugador vs Jugador (Caza y absorción de VES)
  for (let i = 0; i < ids.length; i++) {
    for (let j = 0; j < ids.length; j++) {
      if (i === j) continue;
      const p1 = players[ids[i]];
      const p2 = players[ids[j]];

      if (!p1 || !p2) continue;

      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

      // p1 se come a p2
      if (dist < p1.radius && p1.radius > p2.radius * 1.15) {
        p1.radius += p2.radius * 0.3;
        p1.ves += p2.ves; // Se absorben todos los VES

        // Notificar muerte a p2
        // (En una implementación completa se emite el evento al socket correspondiente)
        delete players[p2.id];
      }
    }
  }

  // Transmitir el estado global a todos los clientes conectados
  const payload = JSON.stringify({ type: 'state', players });
  server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}, 1000 / 60);