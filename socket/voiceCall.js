const activeCalls = {};

module.exports = function (socket, io) {
    socket.on('voiceEvent', async (data, callback = () => {}) => {
        try {
            const actions = Array.isArray(data) ? data : [data];

            for (const { action, payload } of actions) {
                switch (action) {
                    case 'initiateCall':
                        handleInitiateCall(payload);
                        break;
                    case 'answerCall':
                        handleAnswerCall(payload);
                        break;
                    case 'iceCandidate':
                        handleIceCandidate(payload);
                        break;
                    case 'endCall':
                        handleEndCall(payload);
                        break;
                    default:
                        console.warn(`Unknown voice action: ${action}`);
                        callback({ success: false, error: `Unknown action: ${action}` });
                        break;
                }
            }
        } catch (err) {
            console.error('Error handling voiceEvent:', err);
            callback({ success: false, error: 'Internal server error' });
        }
    });

    function handleInitiateCall({ to, offer }) {
        io.to(to).emit('voiceSignaling', {
            type: 'offer',
            offer,
            from: socket.id,
        });

        // Save call info
        activeCalls[socket.id] = { to };
        console.log(`Call offer sent from ${socket.id} to ${to}`);
    }

    function handleAnswerCall({ to, answer }) {
        io.to(to).emit('voiceSignaling', {
            type: 'answer',
            answer,
            from: socket.id,
        });

        console.log(`Answer sent from ${socket.id} to ${to}`);
    }

    function handleIceCandidate({ to, candidate }) {
        io.to(to).emit('voiceSignaling', {
            type: 'ice-candidate',
            candidate,
            from: socket.id,
        });

        console.log(`ICE candidate sent from ${socket.id} to ${to}`);
    }

    function handleEndCall({ to }) {
        io.to(to).emit('voiceSignaling', {
            type: 'end-call',
            from: socket.id,
        });

        console.log(`Call ended by ${socket.id} to ${to}`);

        delete activeCalls[socket.id];
    }

    socket.on('disconnect', () => {
        const call = activeCalls[socket.id];
        if (call && call.to) {
            io.to(call.to).emit('voiceSignaling', {
                type: 'end-call',
                from: socket.id,
            });
        }

        delete activeCalls[socket.id];
    });
};
