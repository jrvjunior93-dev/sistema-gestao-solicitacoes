const jwt = require('jsonwebtoken');

const JWT_SECRET = 'segredo_super_secreto';

module.exports = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader)
    return res.status(401).json({ error: 'Token não informado' });

  const [, token] = authHeader.split(' ');

  try {

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();

  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
};
