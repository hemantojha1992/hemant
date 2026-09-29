// import dbPool from '../rider/database/db';
const dbPool = require('../rider/database/db');

const activeSessions = {};

module.exports = function (socket, io) {
    socket.on('chatEvent', async (data, callback = () => { }) => {
        try {
            const actions = Array.isArray(data) ? data : [data];

            for (const { action, payload } of actions) {
                switch (action) {
                    case 'initiateSession':
                        await handleInitiateSession(payload, callback);
                        break;
                    case 'joinSession':
                        await handleJoinSession(payload);
                        break;
                    case 'sendMessage':
                        await handleSendMessage(payload);
                        break;
                    case 'getMessages':
                        await handleGetMessages(payload, callback);
                        break;
                    case 'editMessage':
                        await handleEditMessage(payload);
                        break;
                    case 'deleteMessage':
                        await handleDeleteMessage(payload);
                        break;
                    case 'closeChat':
                        await handleCloseChat(payload);
                        break;
                    default:
                        console.warn(`Unknown chat action: ${action}`);
                        callback({ success: false, error: `Unknown action: ${action}` });
                        break;
                }
            }
        } catch (err) {
            console.error('Error handling chatEvent:', err);
            callback({ success: false, error: 'Internal server error' });
        }
    });


    async function handleInitiateSession({ sessionId, userId, role }, callback) {
        try {
            if (sessionId) {
                let whereClause = 'id = ?';
                let params = [sessionId];

                if (role === 'admin') {
                    whereClause += ' AND (admin_id = ? OR admin_id IS NULL)';
                    params.push(userId);
                } else {
                    whereClause += ' AND user_id = ?';
                    params.push(userId);
                }

                const [results] = await dbPool.query(
                    `SELECT * FROM chat_sessions WHERE ${whereClause}`,
                    params
                );

                if (results.length > 0) {
                    const session = results[0];

                    // ✅ If admin_id is NULL, update it with current admin userId
                    if (role === 'admin' && session.admin_id === null) {
                        await dbPool.query(
                            `UPDATE chat_sessions SET admin_id = ? WHERE id = ?`,
                            [userId, sessionId]
                        );
                        console.log(`Admin ${userId} assigned to session ${sessionId}`);
                    }

                    socket.join(`session_${sessionId}`);
                    console.log(`User ${userId} rejoined session ${sessionId}`);

                    const [messages] = await dbPool.query(
                        `SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC`,
                        [sessionId]
                    );
                    console.log('messages-------->>>>>>>>',messages)

                    return callback({
                        success: true,
                        sessionId,
                        reused: true,
                        messages
                    });
                }
            }

            // If sessionId not passed or not found, create new one
            const res = await createNewSession({ userId, role });

            if (res.success) {
                console.log(`User ${userId} joined session ${res.sessionId}`);
                socket.join(`session_${res.sessionId}`);
            }

            callback({ ...res, messages: [] });

        } catch (err) {
            console.error('Error in initiateSession:', err);
            callback({ success: false, error: 'DB Error' });
        }
    }

    async function createNewSession({ userId, role }) {
        const column = role === 'admin' ? 'admin_id' : 'user_id';
        const selectQuery = `SELECT id FROM chat_sessions WHERE ${column} = ? AND status = 'open' ORDER BY id DESC LIMIT 1`;

        try {
            const [results] = await dbPool.query(selectQuery, [userId]);

            if (results.length > 0) {
                return { success: true, sessionId: results[0].id };
            }

            const insertQuery = `INSERT INTO chat_sessions (${column}) VALUES (?)`;
            const [result] = await dbPool.query(insertQuery, [userId]);

            return { success: true, sessionId: result.insertId };
        } catch (err) {
            console.error('Error creating session:', err);
            return { success: false, error: 'Database error' };
        }
    }

    async function handleJoinSession({ sessionId, userId, role }) {
        socket.join(`session_${sessionId}`);
        if (!activeSessions[sessionId]) activeSessions[sessionId] = [];
        activeSessions[sessionId].push(socket.id);

        const column = role === 'admin' ? 'admin_id' : 'user_id';
        const sql = `UPDATE chat_sessions SET ${column} = ? WHERE id = ? AND (${column} IS NULL OR ${column} != ?)`;

        try {
            await dbPool.query(sql, [userId, sessionId, userId]);
        } catch (err) {
            console.error('Failed to update join status:', err);
        }
    }

    async function handleSendMessage({ sessionId, senderId, message }) {
        try {
            const [result] = await dbPool.query(
                'INSERT INTO chat_messages (session_id, sender_id, message) VALUES (?, ?, ?)',
                [sessionId, senderId, message]
            );

            io.to(`session_${sessionId}`).emit('newMessage', {
                id: result.insertId,
                sessionId,
                senderId,
                message,
                sent_at: new Date(),
            });
        } catch (err) {
            console.error('Failed to send message:', err);
        }
    }

    async function handleGetMessages({ sessionId }, callback) {
        try {
            const [results] = await dbPool.query(
                'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY sent_at ASC',
                [sessionId]
            );
            callback({ success: true, messages: results });
        } catch (err) {
            console.error('Failed to get messages:', err);
            callback({ success: false, error: 'Failed to fetch messages' });
        }
    }

    async function handleEditMessage({ sessionId, messageId, newText }) {
        try {
            await dbPool.query(
                'UPDATE chat_messages SET message = ?, is_edited = 1, edited_at = NOW() WHERE id = ?',
                [newText, messageId]
            );
            io.to(`session_${sessionId}`).emit('messageEdited', { messageId, newText });
        } catch (err) {
            console.error('Failed to edit message:', err);
        }
    }

    async function handleDeleteMessage({ sessionId, messageId }) {
        try {
            await dbPool.query(
                'UPDATE chat_messages SET is_deleted = 1, deleted_at = NOW() WHERE id = ?',
                [messageId]
            );
            io.to(`session_${sessionId}`).emit('messageDeleted', { messageId });
        } catch (err) {
            console.error('Failed to delete message:', err);
        }
    }

    async function handleCloseChat({ sessionId }) {
        try {
            await dbPool.query(
                'UPDATE chat_sessions SET status = "closed", closed_at = NOW() WHERE id = ?',
                [sessionId]
            );
            io.to(`session_${sessionId}`).emit('chatClosed', sessionId);
        } catch (err) {
            console.error('Failed to close chat:', err);
        }
    }
};
