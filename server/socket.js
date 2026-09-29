const socketIO = require('socket.io');

module.exports = (server) => {
    const io = socketIO(server, {
        cors: {
            origin: [ 'http://localhost:8080'], // Whitelist specific origins
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        socket.on('chat message', (msg) => {
            console.log('Received message:', msg);
            io.emit('chat message', msg);
        });
        socket.on('distWalletBalance', (msg) => {
            
            io.emit('distWalletBalance', {ram:'shyam'});
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });

    io.on('error', (err) => {
        console.error('Socket.IO error:', err);
        // Handle the error gracefully
    });
};
