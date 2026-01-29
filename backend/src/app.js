const express = require('express');
const cors = require('cors');
const app = express();

const db = require('./models');
const routes = require('./routes');
const path = require('path');

app.use(cors());
app.use(express.json());


app.use(
  '/uploads',
  require('cors')(),
  express.static(path.resolve(__dirname, '..', 'uploads'))
);

app.use(routes);



db.sequelize.sync()
  .then(() => console.log('Banco de dados sincronizado'))
  .catch(err => console.error('Erro ao sincronizar banco', err));

app.get('/health', (req, res) => res.json({ ok: true }));

module.exports = app;
