const chatSocket = require('./chat.js');
const voiceCallHandler = require('./voiceCall.js');


module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    chatSocket(socket, io);
    voiceCallHandler(socket, io);


    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
};