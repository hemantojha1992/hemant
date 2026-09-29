const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next)
{
    console.log(req);
    const authHeader = req.header('Authorization'); 

    if (!authHeader || !authHeader.startsWith('Bearer '))
    {
        return res.status(401).json({ status:0,message: 'unauthorized' });
    }
    const token = authHeader.split(' ')[1]; 
    try{
        const JWT_SECRET = process.env.JWT_SECRET
        const getUser = jwt.verify(token,JWT_SECRET); 
        req.user = getUser;
        next(); 
    } catch (err) {
        return res.status(403).json({ status:0,message: 'Invalid token' });
    }
}

module.exports = authenticateToken;
